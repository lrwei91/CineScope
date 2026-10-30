#!/usr/bin/env python3
"""CineScope static releases: validate, switch atomically, verify, then prune."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

REVISION = re.compile(r"[0-9a-f]{40}")


def run(*args, **kwargs):
    return subprocess.run(args, check=True, timeout=600, **kwargs)


def unpack(archive, destination):
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        for member in members:
            target = (destination / member.name).resolve()
            if not target.is_relative_to(destination.resolve()) or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise RuntimeError("Unsafe source archive member")
        bundle.extractall(destination, members=members)


def verify(site, base_url):
    files = ['index.html', 'app.js', 'style.css', 'manifest.webmanifest']
    files += [str(p.relative_to(site)) for p in sorted((site / 'json').glob('*.json'))]
    # Include a real local poster in the HTTP verification.
    files += [str(next((site / 'posters').rglob('*.jpg')).relative_to(site))]
    for relative in files:
        request = urllib.request.Request(base_url.rstrip('/') + '/' + relative, headers={'User-Agent': 'CineScope-deploy'})
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=20) as response:
            actual = hashlib.sha256(response.read()).digest()
        if actual != hashlib.sha256((site / relative).read_bytes()).digest():
            raise RuntimeError('HTTP content mismatch: ' + relative)


def switch_link(root, target):
    temporary = root / ('current-next-' + str(os.getpid()))
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(root / 'current')


def publish(site, revision, root, base_url):
    if not REVISION.fullmatch(revision):
        raise ValueError('Expected a full Git commit SHA')
    releases = root / 'releases'
    releases.mkdir(parents=True, exist_ok=True)
    current = root / 'current'
    previous = current.resolve() if current.is_symlink() else None
    release = releases / revision
    if release.exists():
        raise RuntimeError('Release already exists: ' + revision)
    shutil.copytree(site, release)
    (release / '.deployed-revision').write_text(revision + '\n')
    switch_link(root, release)
    try:
        verify(release, base_url)
    except Exception:
        if previous:
            switch_link(root, previous)
        else:
            current.unlink(missing_ok=True)
        shutil.rmtree(release)
        raise
    # Only delete precisely named release directories after the new one passes.
    for old in releases.iterdir():
        if old != release and old.is_dir() and not old.is_symlink() and REVISION.fullmatch(old.name):
            shutil.rmtree(old)
    print('Deployed ' + revision, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--source', type=Path, help='Validated local source tree for initial deployment')
    parser.add_argument('--revision')
    args = parser.parse_args()
    root = Path(os.environ.get('CINESCOPE_ROOT', '/srv/cinescope'))
    state = Path(os.environ.get('CINESCOPE_STATE', '/var/lib/cinescope'))
    repository = os.environ.get('CINESCOPE_REPOSITORY', 'lrwei91/CineScope')
    base_url = os.environ.get('CINESCOPE_VERIFY_URL', 'http://127.0.0.1:18081')
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'deploy.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if args.source:
            if not args.revision or not REVISION.fullmatch(args.revision):
                parser.error('--source requires --revision with full commit SHA')
            revision = args.revision
        else:
            response = run('curl', '-fsSL', '--retry', '2', '--max-time', '45',
                           'https://api.github.com/repos/' + repository + '/commits/main', capture_output=True)
            revision = json.loads(response.stdout)['sha']
            if not REVISION.fullmatch(revision):
                raise RuntimeError('Invalid remote commit SHA')
        marker = root / 'current/.deployed-revision'
        deployed = marker.read_text().strip() if marker.exists() else None
        if args.check:
            print(json.dumps({'deployed': deployed, 'remote': revision, 'update_available': deployed != revision}))
            return
        if deployed == revision:
            return
        with tempfile.TemporaryDirectory(prefix='build-', dir=state) as work:
            work = Path(work)
            if args.source:
                source = args.source.resolve()
            else:
                # A shallow Git cache transfers changed objects instead of downloading
                # hundreds of MB of unchanged posters with every data update.
                source = state / 'source'
                source.mkdir(exist_ok=True)
                if not (source / '.git').exists():
                    run('git', 'init', str(source))
                has_head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=source,
                                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
                negotiation = ['--negotiation-tip=HEAD'] if has_head else []
                run('git', '-c', 'http.version=HTTP/1.1', '-c', 'gc.auto=0', 'fetch',
                    '--no-tags', '--depth=1', *negotiation,
                    'https://github.com/' + repository + '.git', revision, cwd=source)
                run('git', 'checkout', '--force', '--detach', revision, cwd=source)
            environment = dict(os.environ, SITE_OUTPUT_DIR='.site')
            run('npm', 'run', 'check', cwd=source, env=environment)
            run('npm', 'run', 'build:site', cwd=source, env=environment)
            publish(source / '.site', revision, root, base_url)
            if not args.source:
                shutil.rmtree(source / '.site')
                run('git', 'update-ref', 'refs/heads/deployed', revision, cwd=source)
                run('git', 'reflog', 'expire', '--expire=now', '--all', cwd=source)
                run('git', 'gc', '--prune=now', cwd=source)


if __name__ == '__main__':
    main()
