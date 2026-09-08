# ConstitutionalWorkshop — audit notes

Date: 8 September 2026  
Scope: `contracts/ConstitutionalWorkshop.sol` (Solidity 0.8.24, EVM Paris)  
Method: line review, threat list, Foundry suite including fuzz on the bond path  
Status: no critical or high findings remaining in scope

This is an engineering review of the source in this repository. It is not a formal firm-signed audit, not insurance, and not a statement about any other contract that later reads `rollingRoot`.

## 1. What the contract is allowed to do

- Sit an address once, if the workshop window is open and `msg.value == seatBond`.
- Vacate that address forever.
- Store a bounded clause.
- Accept one mark per address per clause, changeable while the row is open.
- Seal a row when age, census quorum, majority-of-cast, and `yea > nay` all hold.
- Accumulate a `rollingRoot` of sealed leaves.

It has no owner, no pause, no upgrade slot, no ERC-20, no mint, no rescue, and no path that returns the bond.

## 2. Invariants the tests pin down

| Invariant | Gate |
| --- | --- |
| Exact bond or revert | `attest` |
| Bond leaves the contract | balance after attest is 0; sink received the bond |
| One seat per address, including after revoke | `Bound` |
| No ether via `receive` / `fallback` | `NoCash` |
| Empty / oversized / bad article rejected | `Empty`, `TooLong`, `BadArticle` |
| At most five unsealed clauses per seat | `Quota` |
| Address that sat after `postedAt` cannot mark that row | `NotYet` |
| Vacated address cannot mark | `Vacant` |
| Seal before `MIN_AGE` reverts | `Early` |
| Seal below 50% of census reverts | `Short` |
| Tie or nay-side plurality reverts | `Thin` |
| Sealed row cannot be remade or revoted | `Frozen` |
| Submit dies at `closedAt`; seal does not | window split |
| Constructor rejects zero bond and malformed windows | `BadBond`, `BadWindow` |

20 tests passed, including 256 fuzz runs on mismatched bond values.

## 3. Threats that were closed in design

**Admin key.** None stored. Policy numbers (`QUORUM_BPS`, `PASS_BPS`, `MIN_AGE`, size caps, sink) are compile-time constants.

**Upgradeable proxy.** Not used. Sealed slots have no later writer.

**Bond recycling.** Burn to `0x…dEaD` with `extcodesize == 0` checked in the constructor. Revoke does not refund. Re-attest after revoke reverts, so a seat cannot farm a cheap second census slot.

**Dilution.** Each clause snapshots `active` at post time. New seats cannot vote that row and cannot inflate its denominator.

**Last-minute farming.** Same snapshot rule. `joinedAt > postedAt` is a hard miss.

**Author rewrite.** Title and body are written once. A new opinion is a new id.

**Stuck last-day clauses.** Seal is allowed after `closedAt`. Only `attest` / `submit` die with the window.

**Reentrancy.** Mutex on every state-changing path. External call exists only in `attest`, after the seat row is written, to a sink that is not this contract.

**Accidental ETH.** `receive` and `fallback` revert. `attest` requires the exact bond, not “at least”.

**Quorum theatre.** Quorum is absolute against the snapshot, not against turnout. A 1–0 vote on a large census cannot seal.

**Tie.** `yea <= nay` fails even when turnout looks large.

**Self-deal seal.** Seal is permissionless and does not pay the sealer. No incentive to grief beyond gas.

## 4. Residual risk (accepted)

**R1 — Sybil at the bond price.** Anyone who can burn `seatBond` once per fresh address can sit. If the bond is tiny relative to the value of a later Governor, the census is cheap. Mitigation is the bond amount chosen at construction, plus the no-rejoin rule. This is not proof of personhood.

**R2 — Timestamp.** `MIN_AGE` is three days. A validator can nudge `block.timestamp` by a small skew. That does not collapse a three-day gate.

**R3 — RPC honesty in the interface.** The pages trust the RPC in `launch.json` for reads. Writes still require a local wallet signature. A lying RPC can paint a false draft. The contract does not.

**R4 — Gas of stored strings.** Bodies up to 2048 bytes are kept on chain so the record does not depend on an indexer. That is expensive on a dear fee market and is a feature on a cheap one.

**R5 — Contract wallets.** `attest` does not ban `extcodesize > 0`. A factory can sit many contracts if it pays many bonds. Same as EOA farming at the bond price.

**R6 — Unsealed quota vs. revoke.** Revoke does not delete the author’s open clauses. Those rows remain and can still seal. That is intended. The author’s `unsealed` counter is only a spam cap.

**R7 — No on-chain identity beyond the address.** Lost keys lose the seat. There is no recovery registrar.

## 5. Findings log

| ID | Severity | Item | Resolution |
| --- | --- | --- | --- |
| F1 | High (fixed before freeze) | `sealed` used as an identifier — reserved word in 0.8.24 | Renamed `sealedCount` |
| F2 | Medium (fixed) | Test helper warped every join to the same timestamp, hiding the late-joiner rule | Join helper now advances time |
| F3 | Low (fixed) | Reentrancy and “already seated” shared `Bound` | Split `Locked` |
| F4 | Info | Majority check is unreachable when turnout is low because `Short` fires first | Kept; quorum is the stricter public rule. Tie case still hits `Thin`. |

No open critical or high items on the frozen source.

## 6. What a later Governor must not do

A later module that reads `rollingRoot` should treat it as an append-only commitment. It should not accept an owner-supplied substitute root. It should not treat an EOA as this contract. That module is out of scope here and must be reviewed on its own bytecode.
