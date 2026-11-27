# AI usage log

Countersign is built **AI-native**. One human builder (the repo owner) works with **Claude Code (Claude Opus 5.5)** in a single session. The AI writes the contracts, tests, scripts, web app and docs. The human sets the scope (`CLAUDE.md`), reviews, and does every step only a human can do: faucet claims, QoreX wallet actions, the QCAI audit on the dashboard, the project page, the GitHub App, the video.

Every task gets an entry, in order, in this format:

- **Asked:** what the human asked for
- **AI generated:** files and commands
- **Human reviewed / changed:** what the builder checked or edited
- **AI mistakes and how they were caught:** failing test, audit finding, testnet refusal, review
- **MCP / tools used:** QoreChain MCP tools, docs, read-only chain calls

Commits written with the AI carry a `Co-Authored-By: Claude` trailer.

---

## Log

### T0: Repo setup and local git identity (27 Nov 2026)
- **Asked:** set up the repo from `CLAUDE.md` §5: licence, `.gitignore`, README stub, `AI_USAGE.md`, `NOTICE`, `.mcp.json`. Make the `ayush-ranjan-official` GitHub account this repo's commit and push identity, **local only** (not global).
- **AI generated:** `LICENSE` (the canonical Apache-2.0 text from apache.org, sha256 `cfc7749b…3d30`), `NOTICE`, `README.md`, `AI_USAGE.md`, `.gitignore`, `.mcp.json`, `docs/DEMO.md`. Local `git config` (`user.name`, `user.email` = the account's GitHub noreply address, and a repo-local credential helper that reads the `ayush-ranjan-official` token from `gh`). A local, uncommitted `.git/hooks/pre-commit` that blocks `.env` files, `refs/`, private keys, mnemonics and `QRC1-` recovery codes.
- **Human reviewed / changed:** approved the plan. Chose to keep their existing QoreChain wallet as the funding source and QoreX party, with no key ever exported (scripts use generated throwaway keys only).
- **AI mistakes and how they were caught:** none yet.
- **MCP / tools used:** read-only checks before planning: `eth_chainId` on `evm-testnet.qore.host` (= `0x2648`, 9800), `GET /cosmos/evm/vm/v1/params` (precompiles `0x…0a01` and `0x…0a02` active), `npm view` for package versions, `git ls-remote` for the reference repos and the Asset Kit `v0.1.0` tag.
