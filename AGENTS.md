# 仓库约定

## 提交身份

代维护者提交变更时，使用其 GitHub 账号 `pepedd864`，并在本仓库配置身份：

```sh
git config --local user.name "pepedd864"
git config --local user.email "pepedd864@gmail.com"
```

提交前用 `git var GIT_AUTHOR_IDENT` 和 `git var GIT_COMMITTER_IDENT` 核对作者与提交者。

## 提交规范

每个提交只包含一个完整目的，提交信息遵循 Conventional Commits，描述和正文使用中文。
