# Key compromise without C8

**For the owner.** Signed key rotation (ARC-11-C8) is deferred (the owner, 2026-10-14). Until it ships, the two keys
this product trusts can only be replaced by a release. This page is the manual path. It needs no code and no help from
anyone else. On Windows PowerShell, type `.\snowarch.cmd` wherever this page says `./snowarch`.

## Lost or compromised

- **Lost**: a private key is gone, and nobody else has it. Restore it from the backup you made when you ran
  `keygen`. Nothing else changes, and no licensee does anything.
- **Compromised**: somebody else may hold a private key, the primary or the recovery one. Follow the steps below. A
  stolen key can sign a licence or a revocation list that every install trusting that key accepts. The only answer is
  a release that no longer trusts it.

## The steps

1. **Make new keys on your own machine, outside any checkout.**

   ```sh
   ./snowarch licence keygen --out ~/snowarch-keys/2027/primary.pem --recovery-out ~/snowarch-keys/2027/recovery.pem --to "Your Name" --org "Your Organisation"
   ```

   - `--out` and `--recovery-out` are where the two new private keys are written. Use a new folder, never the folder of
     the keys you are replacing.
   - `--to` and `--org` are your own name and organisation, as on your first `keygen`. A placeholder is refused, because
     the creator licence `keygen` writes is signed with whatever it was given.
   - Back up both keys before step 2.

2. **Cut a release that ships only the new public keys.**
   - In the engineering checkout, replace both entries in `tools/snowarch/lib/licence/keys.mjs` and in the server's
     `keys.ts` with the new primary and recovery. `keygen` printed the two public keys as "to be committed into the
     product", and wrote them to a file beside the private keys.
   - Rebuild `dist/`, and cut the release as usual.
   - Its tests hold each file to exactly two keys (`licence-keys-guard.test.mjs`) and the two files equal
     (`licence-parity.test.mjs`).
   - Sign the release's manifest with the new primary: `./snowarch licence sign-release` takes it with `--key`.

3. **Reissue every live licence with the new primary.** Use the same id and the same terms, and send each licensee
   their new file.

   ```sh
   ./snowarch licence issue --id LIC-2026-0002 --to "Example Licensee" --org "Example Ltd" --scope live --valid-until 2027-10-10 --key ~/snowarch-keys/2027/primary.pem --out ~/snowarch-reissued/LIC-2026-0002.json
   ```

   - `--id`, `--to`, `--org`, `--scope` and `--valid-until` are copied from the licence being replaced:
     `./snowarch licence verify <its file>` prints every one of them. A perpetual licence takes `--perpetual` instead
     of `--valid-until`.
   - `--out` is where the new file is written.

4. **Revoke nothing that the old key cannot sign anyway.**
   - On the new release, the old key signs nothing. A licence it signed, genuine or forged, does not verify there, and
     revoking it would add nothing.
   - From now on, the revocation list is signed with the new primary. `init-list` starts one, and `revoke` adds to it.

5. **What each licensee does:**
   - upgrade to the new release (`./snowarch upgrade`);
   - copy the reissued file to `.local/licence.json`;
   - restart Claude Code.

   `./snowarch licence show` then prints the new key's fingerprint and `ok`.

## The bound

An install that is not upgraded still trusts the old keys, so a stolen key keeps signing for it. Only the upgrade
closes that, which is why step 5 is every licensee's to do. It is also why ARC-11-C8, a signed key statement that
every 2.1 install reads, is the row to revisit at 2.2 or before wider distribution.
