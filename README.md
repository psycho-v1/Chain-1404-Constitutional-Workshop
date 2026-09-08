# Constitutional Workshop

A formation record for community Chain 1404.

Members attest an equal seat, post one clause at a time, mark yea or nay, and let anyone seal a clause once age, quorum and a strict majority all hold. The interface is a static dapp. The contract is the record. A later Governor may consume `rollingRoot`. It does not live in this repository.

This is not the BDAG company, not a treasury, and not a token vault.

## Use

Public site: https://psycho-v1.github.io/Chain-1404-Constitutional-Workshop/

Open that URL in a wallet browser on Chain 1404. New visitors should start at `guide.html`. Connect. Attest a seat from **Seats** or **Submit**. The seat bond is burned and does not come back. Write clauses in SHALL / SHALL NOT language. Mark only clauses posted after you sat. After three days, if the row meets the bar, anyone may press **Seal**.

Live record: `0x897d85654c569e64dff78b90bfb7ebe12ee7a67d`

`launch.json` holds the chain id, RPC list, and that address. The interface reads it. A later Governor may consume `rollingRoot`. It does not live in this repository.

## Record rules

- One address, one seat. No transfer. No second sitting after revoke.
- Five unsealed clauses per seat.
- Title ≤ 140 bytes, body ≤ 2048 bytes.
- Only seats that existed at post time may mark that clause.
- Quorum is 50% of that snapshot, not 50% of turnout.
- Yea must beat nay.
- Minimum age before seal is three days.
- Submit ends with the workshop window. Seal does not.

## Layout

```
index.html    workshop interface (also copied under app/)
contracts/    ConstitutionalWorkshop.sol
test/         Foundry suite
legal/        Terms, Privacy, Community Policy
AUDIT.md      review of the contract
launch.json   chain + record address the interface reads
```

## Documents

- [Terms of Use](legal/TERMS.md)
- [Privacy](legal/PRIVACY.md)
- [Community Policy](legal/COMMUNITY_POLICY.md)
- [Audit notes](AUDIT.md)

## License

MIT. See `LICENSE`.
