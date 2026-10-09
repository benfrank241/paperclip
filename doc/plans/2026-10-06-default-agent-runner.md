# Runner defaults: staged delivery

Updated 2026-10-09.

## Outcome and ownership

Users choose a harness. New agents use Paperclip Runner where the harness and
execution target are qualified. Existing agents keep their recorded runner.
The task owns implementation, verification, review fixes, and reviewable PRs.
Merging and deployment require separate authorization.

The original implementation is preserved on `codex/default-agent-runner` at
`171d841295808ca185a258aaeb10b3dee68bb2b9`. Its public review is
[PR #15422](https://github.com/paperclipai/paperclip/pull/15422).
The user approved splitting that work into four useful steps:

1. Packaged runtime reliability and Codex prerequisites, without changing defaults.
2. Codex defaults across creation, onboarding, hiring, imports, and the UI.
3. Claude defaults and authentication.
4. The remaining supported harness defaults and provider-specific fixes.

## Completed prerequisite

[PR #15555](https://github.com/paperclipai/paperclip/pull/15555) merged at
`6f9d0a56ba3c2f0059a723b7de434320eed7eb22`. Its final candidate `dde37d7`
passed 47 ordinary CI jobs and fresh 5/5 automated review. The actual clean Linux
npm consumer checked all 17 tarballs for absent Codex native payloads and official
npm host dependencies. Actual Codex 0.156.1 startup passed on macOS ARM64.
[Bot lockfile refresh #15673](https://github.com/paperclipai/paperclip/pull/15673)
is merged. These checks did not qualify onboarding or cloud rollout.

Removed prerequisite work remains on `codex/runner-packaging-full-snapshot` at
`6f3060beaa842ffcee21af058370d3cab5f571e9`. Do not restore its release workflows,
Docker materialization, Git installer, or extra login isolation wholesale.

## Current slice: Codex defaults

Authorized 2026-10-09. Canonical branch: `codex/codex-runner-default`.
Master base: `57e977be7` (includes both prerequisite merges and Pi integration).
Canonical PR: [draft #15683](https://github.com/paperclipai/paperclip/pull/15683).
Initial CI candidate: `8ce217b71`. Scoped environment discovery and native import
preservation are committed at `5ba1bc986`; the final follow-up preserves saved
model, effort, and timeout through runner-only built-in configuration changes.
Preview: [isolated Codex QA](http://127.0.0.1:3124), normal dev supervisor,
separate empty database. Current-head live evidence is pending the source freeze
and verified binary provenance; older services and artifacts are not proof.

New Codex agents select Paperclip Runner on qualified Linux x64 targets. Users
choose Codex, with Paperclip Runner or Legacy runner inside Advanced. Other
harness defaults stay unchanged. Existing legacy/native agents and ordinary
edits retain recorded execution; explicit runner changes use revisions/session
invalidation. No database migration or permission-policy change.

Resolve before validation/auth/instructions/skills at the common creation
boundary. Cover direct/API/CLI creation, onboarding seeds, hires, frozen
approvals, built-ins, plugins, and import/export. Unsupported platforms or active
external overrides retain legacy selection. Missing dependencies, invalid models,
authentication failures, and incompatible settings remain actionable errors,
without silently choosing another runner. Native Codex bypasses the experimental
gate; other native providers retain their existing gate.

Finish line: one narrow reviewable PR, affected regressions and required checks
passing, useful Codex tasks plus follow-up and independently checked artifacts,
onboarding and existing-agent preservation verified locally and on qualified
managed staging, and inspectable evidence. Human merge and production deployment
remain separate actions. Actual production composition remains a post-merge gate.

## Coverage and execution ownership

Reuse Product E2E profiles, fixtures, graders, reports, and installation checks.
The `first-task` native Codex case now inspects the wizard's saved default directly
with the experimental flag disabled. The legacy control selects its override
before authentication. Each isolated onboarding company has a $5 task budget;
setup probes require their own reserved allowance.
Claude's explicit native fixture is unchanged until its later default PR.

| Area | Owner | Current state |
| --- | --- | --- |
| Shared contract, server resolution, setup readiness | Core worker | 88 selection/setup, 39 route/artifact and 6 transport controls pass; server noemit passes; rebuilt daemon and Linux DB proof pending |
| Production create/edit/onboarding UI and stories | UI worker | Implemented; 339 affected tests, UI typecheck and token gates pass; story evidence in progress |
| Built-ins, plugins, approvals, imports/exports, CLI | Creation-path worker | Implemented; 102 portability, 8 approval, 3 CLI and 3 built-in unit checks pass; 72 DB checks require Linux |
| Execution/dev gate, E2E gaps, packaging, live journeys | Lead | 28 runtime-selection and 122 onboarding/catalog support checks pass; actual journeys pending |
| Full CI and final review | Lead | Initial Linux CI and Greptile running on `8ce217b71`; final-head verification pending |
| Local API/subscription task + follow-up | Lead | Credential/runtime identity inventory; unverified on this branch |
| Managed staging API/subscription onboarding | Lead | Exact-source preview/artifact and budget qualification pending |
| Shipped npm/Docker/cloud artifacts | Lead | Reuse existing hosted checks; prerequisite packaging proof is historical |

Keep CPU-heavy Rust/Docker builds in hosted CI. Use Node 24, bounded workers,
conservative provider turns/timeouts and existing QA accounts. Login interactions
use the embedded browser. Do not change user preview services or production.

The original $250 ceiling remains. Historical receipts include unknown-charge
reserves; the latest retained ledger holds $248.18 in costs/reservations and
reports $1.82 unallocated, not a certified invoice balance. Reconcile unstarted
reservations and current resource/credential state before paid runs. Do not reset
the ceiling or treat missing charges as zero. No new paid call has run in this
slice. Keep exact source/artifact/runtime identities and failed attempts in the
existing report pipeline; mocks and passing CI do not close live acceptance.

Integration found and fixed an import preservation gap: same-harness model edits
must retain the package's explicit runner or the existing agent's runner. Native
setup reuses production remote artifact preparation and verifies the actual
app-server/model path; a version number alone does not reject installed Codex.
Known unsupported local/SSH platforms retain legacy defaults. Sandbox support
does not infer an image architecture; setup verifies its actual artifacts.

Public package audit found flat Linux x64 daemons in current stable and canary
server tarballs. Normal release builds stage only the build host's daemon; the
multi-platform assembly helper has no release caller or macOS artifact producer.
Automatic macOS/Windows/Linux ARM defaults therefore remain legacy in this slice.
Existing explicit native agents remain usable with their installed runtime.
macOS runner artifact assembly is a separate prerequisite for its default.
Codex setup required three small Rust seams: read-only probes, observed model
reporting, and reasoning effort. Old cached daemon bytes do not verify these.

Local startup hit the macOS shared-memory ID limit. One detached 56-byte segment
was released only after zero attachments and exited owners were verified. No
running server or database file was changed. The separate QA server is healthy.

Next action: verify the final candidate through existing Linux CI/install checks,
fresh review, and bounded actual journeys. Preserve
failed attempts and costs. Unrelated findings and remaining harness qualification
belong to later slices.

Post-rebase UI checks pass (126 cases, typecheck, token gates). Product E2E
catalog/onboarding support passes (122 cases), plus 47 confirmation fixture
checks and E2E noemit. Existing Pi companion/executor controls pass (26 and 34
cases); core selection/setup passes 87 cases and transport passes six.
Production Storybook build and 26 desktop/six mobile captures were completed
before the Pi rebase; they are component evidence, not live execution proof.
Both final integration gaps are implemented: discovery resolves the selected
environment through the same helper as saving, and explicit native export/import
profiles remain valid on macOS while new automatic defaults stay legacy.
Scoped discovery/authorization passes 63 checks. UI context and recovery checks
pass 280 cases plus three final regressions. Missing discovery metadata shows
loading or the server error with Retry; explicit Legacy remains available.
Final portability checks pass 105 cases; approval, built-in asset and CLI unit
controls pass eight, three and three. The 72 skipped DB cases still need Linux.
Final candidate Storybook builds at `5ba1bc986`; fresh desktop/mobile captures
are in progress against the frozen UI tree. The runner-only built-in regression
now checks nondefault settings through switches in both directions.
