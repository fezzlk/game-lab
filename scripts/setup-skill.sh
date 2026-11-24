#!/usr/bin/env bash
# sakurai-skill を取得して .claude/skills/sakurai に置く（リポジトリにはコミットしない）
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
git clone --depth 1 https://github.com/kociden/sakurai-skill.git "$tmp/sakurai-skill"
mkdir -p .claude/skills
rm -rf .claude/skills/sakurai
cp -r "$tmp/sakurai-skill/skills/sakurai" .claude/skills/
rm -rf "$tmp"
echo "installed: .claude/skills/sakurai"
