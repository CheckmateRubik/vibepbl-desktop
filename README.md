# VibePBL Desktop

VibePBL Desktop is a private, offline workspace for the secretary in a medical Problem-Based Learning tutorial group. It keeps the clinical trigger, reasoning process, learning objectives, Act 2 presenter assignments, and hypothesis verification on one local computer.

There are no accounts, rooms, cloud services, analytics, or internet requirements. Session data is stored on the device in SQLite. Portable `.pbl.json` files include embedded copies of imported images for secretary handover.

## Install for normal use

1. Open the project’s **GitHub Releases** page.
2. On Windows, download the `.exe` installer. On macOS, download the `.dmg` for your processor.
3. Double-click the downloaded file and follow the operating-system prompts.
4. Launch **VibePBL Desktop** from the Start menu or Applications folder.

End users do not need Docker, Node.js, Rust, a terminal, an account, or internet access after downloading the installer.

> Maintainers: update the placeholder repository URL in `src-tauri/Cargo.toml` before publishing the first release.

## Secretary workflow

### Act 1

1. Enter the case narrative and import local clinical images.
2. Open an image and click a finding to add a proportionally positioned numbered pin.
3. Clarify unfamiliar terms and build the chronological clinical timeline.
4. Add problem points and formulate differential hypotheses for each one.
5. Write learning objectives and link each to one or more problem points.
6. Print or save the formal Act 1 handout, then mark Act 1 complete to lock editing.

### Act 2

1. Add the persistent tutorial-group roster under **Session & settings**.
2. Add any one-off presenter names and run the fair presenter randomizer.
3. Override an assignment manually when the tutorial group requires it.
4. Cycle each hypothesis through Unchecked, Confirmed, Wrong, and Investigating as evidence is presented.

Act 2 verification updates the same hypothesis records used in Act 1, so both views remain consistent.

## Saving and handover

The active workspace auto-saves to the local SQLite database. **Save .pbl.json** creates a portable backup using the native Save As dialog. **Open .pbl.json** restores the session and writes embedded images into the app’s private data folder.

The member roster persists independently when a session is reset. Use the destructive reset button only after typing `RESET` into the confirmation prompt.

## Offline data locations

Tauri resolves the operating system’s private application-data directory and creates a `vibepbl` folder containing:

- `vibepbl.db` — active session and persistent member roster
- `images/` — private copies of imported clinical images

Deleting an image in the app also removes its private copied file. The original source image is never modified.

## Development

Prerequisites:

- Node.js 20 or newer
- Rust stable 1.77.2 or newer
- The platform prerequisites listed in the Tauri v2 documentation (WebView2 and MSVC tools on Windows; Xcode Command Line Tools on macOS)

From the repository root:

```sh
npm install
npm run dev
```

Build native installers with:

```sh
npm run build
```

Run the dependency-free frontend checks with:

```sh
npm run check:js
node scripts/test-randomizer.mjs
```

## Privacy and security notes

- The app performs no network requests and loads no CDN assets.
- Database field names accepted by native commands are explicitly allow-listed.
- Image deletion is restricted to the app’s private images directory.
- Imported session files are schema-checked before replacing the active session.
- Medical information remains on the local device unless a user explicitly exports and shares a savefile or printout.

VibePBL is an educational organization tool. It does not provide medical advice, diagnosis, or clinical decision support.

## Releasing

The included GitHub Actions workflow builds Windows and macOS bundles when a version tag such as `v1.0.0` is pushed. Configure repository Actions permissions to allow release creation, then attach any required code-signing credentials as repository secrets. Unsigned builds may trigger operating-system warnings.

## License

MIT
