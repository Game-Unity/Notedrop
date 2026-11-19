# Notedrop updates and recovery

Notedrop has three update owners. A source checkout retains the Git updater and fast-forwards only its `origin` when `origin` is exactly `Game-Unity/Notedrop`. A GitHub-distributed packaged desktop app reads electron-builder update metadata from the `Game-Unity/Notedrop` GitHub releases. A Microsoft Store build has all internal update controls disabled and is updated only by the Store. The Etude website, Account, Sync and Market remain external upstream services, but they are not update sources.

The staged desktop package contains an immutable `notedrop.distribution` marker. GitHub packages use `github`, Store packages use `microsoft-store`, and source development remains `development`. Store builds do not initialize electron-updater, schedule update checks, expose update notices, or run the `/api/update` and `notedrop update` paths. The About page still reads its version from the normal server settings.

## Desktop identities and migration

Release 1.0.0 uses Notedrop-owned desktop identities (`com.gameunity.notedrop.desktop`, `com.gameunity.notedrop.macos`, and the `notedrop-desktop` executable). The Notedrop collection remains in `~/.notedrop` or `%USERPROFILE%\.notedrop`, so changing installer identities does not move or replace the database. The old `etude` CLI and launcher names remain compatibility aliases, but they execute the Notedrop binary.

That external data directory also keeps GitHub-to-Store and later Store update data independent of the application package's install directory. A Store package must not redirect `ETUDE_HOME` into package-local storage. If the historical APPX used package-local `LocalState` instead of `%USERPROFILE%\.notedrop`, its contents need a separately verified, non-destructive migration after the old manifest and data layout are known.

Before this repository has a public Notedrop 1.0 installer, no migration from an Etude installation is performed and data in Etude Original's `~/.etude` or `%USERPROFILE%\.etude` is never imported automatically. A prerelease that used the old technical Etude desktop identity may install next to Notedrop 1.0 instead of replacing it; remove that prerelease after confirming the stable installation opened the same `.notedrop` collection.

## Before a source update

The updater refuses to run with tracked local changes, a diverged branch, detached HEAD, a branch without `origin`, or a different repository URL. It then makes an online SQLite backup of the collection and copies the data-directory files into `~/.notedrop/update-backups/` (or the configured `ETUDE_HOME`). The five newest snapshots are retained. This happens before source files or dependencies change.

If an update fails, Notedrop restores the old Git commit, reruns the dependency install from the old lockfile when needed, and restores the previous web build. Before reporting success, it starts the updated server against a copy of the backed-up database on a temporary local port and checks the reported version. Packaged desktop updates create the same safety snapshot before the installer is allowed to start; quitting the app before that backup does not install the pending update.

## Recovering data

Stop the running server, then restore an update snapshot:

```sh
notedrop db restore ~/.notedrop/update-backups/update-<version>-<timestamp> --yes
```

The current database and data files are backed up again before restoration. The restored database must pass SQLite integrity checking. Restore does not delete the previous snapshot.

`etude db restore` remains available as the compatibility command. A normal database-only backup can still be restored by passing its `.db` file.

## Preparing a release

1. Set `package.json` to the intended SemVer version, for example `1.0.1`, and synchronize native versions with `npm run app:version`.
2. Update `CHANGELOG.md`, run the test suite, and build the app.
3. Commit and push `main`.
4. Tag exactly `v<package version>`:

```sh
git tag v1.0.1
git push origin v1.0.1
```

5. The Desktop app workflow verifies the tag, package version, Notedrop artifact names and updater metadata. It builds Windows, macOS and Linux artifacts, smoke-tests the packaged apps, and creates a draft release.
6. Install and update-test the draft on clean Windows, macOS and Linux machines. Confirm data, custom types, media, and settings survive the update.
7. Publish the draft only after those checks.

Prerelease tags must be valid SemVer, and only `latest` stable releases are offered by GitHub's release endpoint. The release tag must match `package.json` exactly; otherwise CI fails before publishing.

## Preparing a Microsoft Store package

Store packaging is an explicit, opt-in build: run `npm run build:store` on Windows. It applies the verified Notedrop Partner Center identity, selects electron-builder's `appx` target, and deliberately omits GitHub publishing and updater metadata. No workflow builds or uploads a Store package automatically.

The build wrapper uses the identity values verified from the existing Store submission. They can still be overridden through the environment when Partner Center changes:

| Environment variable | Required source |
| --- | --- |
| `MSIX_IDENTITY_NAME` | `Package/Identity/@Name` |
| `MSIX_PUBLISHER` | `Package/Identity/@Publisher`, including the complete distinguished name |
| `MSIX_APPLICATION_ID` | `Package/Applications/Application/@Id` |
| `MSIX_PUBLISHER_DISPLAY_NAME` | `Package/Properties/PublisherDisplayName` and the matching Partner Center publisher name |

Also compare the old `Package/Identity/@ProcessorArchitecture`, package version, `PublisherId`, and Package/Identity/Package Family Name in Partner Center. For a locally signed package, `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` must reference the matching code-signing certificate. The build intentionally fails without the four identity values and never guesses them. The historical APPX file and matching Partner Center identity page are therefore required before changing a Store identity value. The package version of the new submission must be higher than the existing Store version.

electron-builder currently produces this Windows Store target with the `.appx` extension. APPX and MSIX full-trust packages use the same manifest identity model; after the identity is verified, the generated package can be inspected and submitted as the intended replacement package without adding a second Store listing.

## Current signing limitation

Windows installer code signing is not configured. The updater verifies the SHA-512 digest from the release metadata and rejects incomplete or corrupted downloads, but Windows SmartScreen and publisher trust still require a signing service. See `signing.md` for the planned Windows signing setup.

There is no automatic installer-level rollback after an operating-system installer has started. Current-source updates restore code on failure, and updater downloads are validated before installation. Before each public release, install the draft over a prior Notedrop release and verify that the installed app starts; until Windows signing is enabled, the release must be treated as unsigned software.
