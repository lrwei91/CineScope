#!/bin/bash

# --- 动态路径配置 (这是主要修改) ---
# 这段代码会自动找出脚本文件所在的目录，然后推断出项目根目录。
# 这样脚本就可以被移动到任何地方，而无需修改。
SCRIPT_DIR=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
# --- 配置区 ---
# Python 脚本相对于项目路径的位置
PYTHON_SCRIPT_1="json/2.get_douban_link_rating_from_google.py"
PYTHON_SCRIPT_2="json/3.verify_douban_link_from_json.py"
# Git 远程仓库的主分支名 (通常是 main 或 master)
GIT_BRANCH="main"
# --- 配置区结束 ---

# 设置脚本在任何命令失败时立即退出
set -e

echo "=============================================="
echo "任务开始于: $(date +'%Y-%m-%d %H:%M:%S')"
# 使用动态计算出的项目目录
echo "项目目录: $PROJECT_DIR"
echo "----------------------------------------------"

# 1. 进入项目目录
# 这里的 "$PROJECT_DIR" 现在是动态计算出来的，而不是硬编码的。
cd "$PROJECT_DIR" || { echo "错误：无法进入项目目录 $PROJECT_DIR"; exit 1; }
echo "成功进入项目目录。"

# 2. 安全地从远程仓库获取更新 (这是核心修改)
echo "正在安全地从远程仓库拉取更新 (仅限快进)..."
# 首先，检查是否有未提交的本地修改。如果有，就停止。
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
    echo "错误：检测到未提交的本地修改。请手动处理。"
    git status
    exit 1
fi

# 然后，尝试只使用 fast-forward 模式进行 pull。
# 如果本地有独有的提交导致无法快进，这个命令会失败，
# 并且由于 set -e 的存在，整个脚本会在此处停止。
git pull origin "$GIT_BRANCH"
echo "Git 更新完成。"
echo "----------------------------------------------"

# 3. 运行 Python 脚本
# ... (这部分逻辑完全不需要修改) ...
echo "正在运行 Python 脚本"
# 确保使用 python3 命令
python "$PYTHON_SCRIPT_1" --overwrite --skip-days 7 --year-range $(($(date +'%Y') - 1)) $(date +'%Y') --skip-count 3
python "$PYTHON_SCRIPT_2" --overwrite --skip-days 7 --start-year $(($(date +'%Y') - 1))

echo "Python 脚本运行结束。"
echo "----------------------------------------------"

# 4. 将 json 文件夹下的 .json 文件推送到远程仓库
# ... (这部分逻辑完全不需要修改) ...
echo "准备推送 json 文件..."

# 检查 json 目录下是否有文件变动
if [[ -z $(git status --porcelain json/*.json) ]]; then
    echo "在 json/ 目录中未检测到文件变动，无需推送。"
else
    echo "检测到 json 文件变动，正在添加到暂存区..."
    git add json/*.json

    echo "正在创建提交..."
    git commit -m "Auto updated link and rating from google"

    echo "正在推送到远程仓库..."
    git push origin "$GIT_BRANCH"
    echo "推送成功！"
fi

echo "----------------------------------------------"
echo "任务成功结束于: $(date +'%Y-%m-%d %H:%M:%S')"
echo "=============================================="