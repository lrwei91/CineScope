import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('static_deploy', Path(__file__).resolve().parents[1] / 'deploy/linux/deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class StaticDeployTests(unittest.TestCase):
    def test_archive_cannot_write_outside_staging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.tar.gz'
            with tarfile.open(archive, 'w:gz') as bundle:
                entry = tarfile.TarInfo('../escape')
                entry.size = 3
                bundle.addfile(entry, io.BytesIO(b'bad'))
            stage = root / 'stage'
            stage.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'Unsafe'):
                deploy.unpack(archive, stage)
            self.assertFalse((root / 'escape').exists())

    def test_failed_http_verification_restores_previous_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous = root / 'releases' / ('a' * 40)
            previous.mkdir(parents=True)
            (root / 'current').symlink_to(previous)
            site = root / 'site'
            site.mkdir()
            (site / 'index.html').write_text('new')
            with patch.object(deploy, 'verify', side_effect=RuntimeError('unhealthy')):
                with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
                    deploy.publish(site, 'b' * 40, root, 'http://localhost')
            self.assertEqual((root / 'current').resolve(), previous.resolve())
            self.assertFalse((root / 'releases' / ('b' * 40)).exists())

    def test_success_prunes_only_previous_release_after_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous = root / 'releases' / ('a' * 40)
            previous.mkdir(parents=True)
            protected = root / 'releases/manual-backup'
            protected.mkdir()
            (root / 'current').symlink_to(previous)
            site = root / 'site'
            site.mkdir()
            with patch.object(deploy, 'verify') as verify:
                deploy.publish(site, 'b' * 40, root, 'http://localhost')
                verify.assert_called_once()
            self.assertEqual((root / 'current/.deployed-revision').read_text().strip(), 'b' * 40)
            self.assertFalse(previous.exists())
            self.assertTrue(protected.exists())
