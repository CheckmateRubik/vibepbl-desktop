# VibePBL Desktop

Clinical Light is the default appearance for new and reset sessions; other themes remain available in Settings.

VibePBL Desktop is a private, offline workspace for the secretary in a medical Problem-Based Learning tutorial group. It keeps the clinical trigger, reasoning process, learning objectives, Act 2 presenter assignments, and hypothesis verification on one local computer.

There are no accounts, rooms, cloud services, analytics, or internet requirements. Session data is stored automatically on the device in SQLite.

## Install for normal use

1. Open the project’s **GitHub Releases** page.
2. On Windows, download `VibePBL.Desktop_<version>_Windows-x64-Portable.exe` and double-click it. No installer is required.
3. On macOS, download `VibePBL.Desktop_<version>_macOS-Universal.dmg`, open it, and drag VibePBL Desktop into Applications.

End users do not need Docker, Node.js, Rust, a terminal, an account, or internet access after downloading the app. The portable Windows executable stores session data in the user's private AppData directory.

The universal macOS DMG supports both Intel and Apple Silicon Macs. It is ad-hoc signed but not Apple-notarized, so macOS may require first-launch approval under **System Settings → Privacy & Security**.

## Secretary workflow

### Act 1

1. Import the case image from the local computer.
2. Open the image and drag across each specific word or region that should be highlighted.
3. Clarify unfamiliar terms and build the chronological clinical timeline.
4. Add problem points and formulate differential hypotheses for each one.
5. Write learning objectives and link each to one or more problem points.
6. Print or save the formal Act 1 handout, then mark Act 1 complete to lock editing.

### Act 2

1. Add presenter names in **Presenter randomizer**.
2. Run the fair presenter randomizer.
3. Override an assignment manually when the tutorial group requires it.
4. Cycle each hypothesis through Unchecked, Confirmed, Wrong, and Investigating as evidence is presented.

Act 2 verification updates the same hypothesis records used in Act 1, so both views remain consistent.

## Saving and reset

The active workspace auto-saves text, images, highlights, timeline entries, problems, hypotheses, objectives, assignments, and verification state to the local SQLite database.

The app asks for confirmation before deleting the working session.

## Offline data locations

Tauri resolves the operating system’s private application-data directory and creates a `vibepbl` folder containing:

- `vibepbl.db` — active session and app data
- `images/` — private copies of imported clinical images

Deleting an image in the app also removes its private copied file. The original source image is never modified.

## Development

Prerequisites:

- Node.js 20 or newer
- Rust stable 1.77.2 or newer
- Windows: Microsoft C++ Build Tools and WebView2
- macOS self-builds: Xcode Command Line Tools

From the repository root:

```sh
npm install
npm run dev
```

Build the standalone executable for the current operating system with:

```sh
npm run build
```

The default build command compiles the standalone executable without an installer. The release workflow separately creates a macOS DMG.

Run the dependency-free frontend checks with:

```sh
npm run check:js
node scripts/test-randomizer.mjs
```

### Compile from source on macOS

To compile the source on your own Mac:

1. Install Xcode Command Line Tools:

   ```sh
   xcode-select --install
   ```

2. Install Node.js 20 or newer and Rust stable. For example, with Homebrew and rustup:

   ```sh
   brew install node
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```

3. Clone the repository, install locked dependencies, check the source, and compile:

   ```sh
   git clone https://github.com/CheckmateRubik/vibepbl-desktop.git
   cd vibepbl-desktop
   npm ci
   npm run check:js
   cargo test --manifest-path src-tauri/Cargo.toml --locked
   npm run build
   ```

4. Run the locally compiled executable:

   ```sh
   ./src-tauri/target/release/vibepbl-desktop
   ```

To create a native-architecture DMG instead, run `npm run tauri -- build --bundles dmg`. A local ad-hoc-signed build may still require approval under **System Settings → Privacy & Security**.

## Privacy and security notes

- The app performs no network requests and loads no CDN assets.
- Database field names accepted by native commands are explicitly allow-listed.
- Image deletion is restricted to the app’s private images directory.
- Medical information remains on the local device unless a user explicitly shares a printout or files from the device.

VibePBL is an educational organization tool. It does not provide medical advice, diagnosis, or clinical decision support.

## Releasing

When a version tag such as `v1.0.11` is pushed, GitHub Actions publishes the standalone Windows executable and a universal macOS DMG. MSI, NSIS, and PKG assets are not produced. Configure repository Actions permissions to allow release creation. The Windows build is unsigned; the macOS build is ad-hoc signed and not notarized, so operating-system warnings may appear.

## License

MIT
