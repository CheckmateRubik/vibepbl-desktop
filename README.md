# VibePBL Desktop

> **AI development disclosure:** VibePBL Desktop was built by ChatGPT Codex in collaboration with, and under the direction of, the project maintainer. ChatGPT Codex wrote and refactored application code, interface styling, tests, documentation, build automation, and cross-platform reliability fixes. The maintainer supplied the product requirements, workflow decisions, visual direction, testing feedback, and release approval.

Clinical Light is the default appearance for new and reset sessions; other themes remain available in Settings.

VibePBL Desktop is a private, offline workspace for the secretary in a medical Problem-Based Learning tutorial group. It keeps the clinical trigger, reasoning process, learning objectives, Act 2 presenter assignments, and hypothesis verification on one local computer.

There are no accounts, rooms, analytics, or cloud synchronization. Session data is stored automatically on the device in SQLite. The workspace and bundled MeSH definitions work offline; MedlinePlus overviews and web search need internet access.

## What VibePBL includes

- Case-image import, zoom controls, and selectable highlighted regions.
- A shared clarifying-terms glossary with direct term entry and editable definitions.
- Fast offline medical-term lookup with typo and incomplete-word matching.
- Optional MedlinePlus health-topic lookup plus Google or DuckDuckGo web search inside VibePBL.
- A chronological clinical timeline with editable events and visual categories.
- Drag-reorderable clinical problems and differential hypotheses.
- Act 1 blue **Prioritize** markers and Act 2 **Correct**, **Wrong**, and **Unchecked** verification states.
- Learning objectives that can each link to multiple problems. The same problem can be linked independently to more than one learning objective.
- A two-round presenter draw: main topics are assigned first, followed immediately by numbered subtopics. A presenter cannot receive the matching main-topic and subtopic number.
- Printable Act 1 summaries with case images, highlights, glossary, timeline, problems, hypotheses, and learning objectives. Print output uses Sarabun for Thai text.
- Automatic local saving, save-before-close protection, session reset confirmation, and persistent presenter names.
- Clinical Light, Dark Mode, Midnight & Gold, Medical Minimal, Warm Sepia, High Contrast, and Retro Web 1.0 themes. Retro deliberately uses square controls, a retro system-font stack, and Internet Explorer-inspired chrome and scrollbars.
- A collapsible sidebar, compact custom title bar, maximized startup, and US English interface wording.
- Windows debug and release executables use the GUI subsystem and do not open a Command Prompt window with the application.

The interface uses the regular VibePBL font stack for Latin text and Sarabun fallback for Thai. Sarabun is redistributed under the SIL Open Font License included in `src/fonts/OFL-Sarabun.txt`.

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
5. Write learning objectives and link each to one or more problem points. The same problem can support multiple objectives; unlinking it from one leaves the others unchanged.
6. Print or save the formal Act 1 handout, then mark Act 1 complete to lock editing.

### Act 2

1. Add presenter names in **Presenter randomizer**.
2. Run the fair presenter randomizer.
3. Override an assignment manually when the tutorial group requires it.
4. In Act 2, cycle each hypothesis through Unchecked, Correct, and Wrong as evidence is presented. Act 1 uses a separate blue Prioritize marker.

Act 2 verification updates the same hypothesis records used in Act 1, so both views remain consistent.

## Saving and reset

The active workspace auto-saves text, images, highlights, timeline entries, problems, hypotheses, objectives, assignments, and verification state to the local SQLite database.

The app flushes pending edits before closing or resetting and keeps the window open if saving fails. Presenter names persist between launches and session resets. The app asks for confirmation before deleting the working session.

## Medical lookup inside VibePBL

In **Clarifying terms**, choose **Term lookup**, or **Look up** on a term. Search an English medical term and optionally add an editable excerpt with its source and retrieval date to a glossary definition. Lookup remains available while Act 1 is locked, but definitions cannot be changed.

- **MeSH definitions** is the default: instant offline search across 31,110 descriptors and 267,012 preferred or entry terms from the bundled [NLM MeSH 2026 dataset](https://www.nlm.nih.gov/databases/download/mesh.html). Exact headings rank first, while incomplete words and minor misspellings return clearly labeled partial or closest matches. Because this is a versioned snapshot, check a current source when recent terminology changes matter.
- **MedlinePlus overviews** offers up to ten related health topics from the [MedlinePlus Web Service](https://medlineplus.gov/about/developers/webservices/). The full returned overview is available; a related topic is explicitly labeled as not an exact-term definition. This service does not include MedlinePlus's separately licensed Medical Encyclopedia articles.
- **Search web** offers Google or DuckDuckGo in a separate browser window belonging to VibePBL, not the operating system's external browser. Searches are manually initiated and the original websites are displayed without scraping, proxying, or an API. Back, Forward, the current address, and Close are in the browser window's own compact toolbar. The window title shows the current site's hostname. Pop-up links stay in that window; downloads and non-HTTPS navigation are blocked.
- No API key, account, payment, or server setup is required for reference lookup or web search. These are independent third-party services and may be unavailable or impose access checks.
- Only an explicitly submitted search term is transmitted, never the session or glossary. Avoid patient-identifying search terms. Providers receive normal connection information such as your IP address. Sites visited in the browser may load ads, trackers, and cookie notices under their own policies.
- Online results use a bounded 30-day SQLite response cache and a bounded local learned-term cache, so repeat searches remain fast after restarting. This cache is reference data, not web browsing history. Excerpts you explicitly add are saved with your glossary. Requests are rate-limited and time out with a retry message.
- Reference data: Courtesy of the U.S. National Library of Medicine. The bundled dataset is identified as MeSH 2026 and may not reflect later updates. No official provider logos are redistributed, and no endorsement is implied. See [Third-party notices](THIRD_PARTY_NOTICES.md). Google and DuckDuckGo are optional website destinations, not bundled services or endorsements.
- Google search is used without sign-in. Google OAuth/account pages are blocked because Google does not permit authentication through developer-controlled embedded user-agents. Google may still show consent checks, bot checks, or decline to load; DuckDuckGo remains available as the key-free alternative.
- The reference browser uses a private browsing session, has no workspace-command permissions, and is closed with the workspace. The main application's security policy is unchanged. Private browsing does not hide network activity from websites or your network provider.

### Bundled offline medical index

The standalone executable contains a compressed, read-only SQLite index derived from the English NLM MeSH 2026 Descriptor XML dataset:

- 31,110 medical descriptors
- 267,012 preferred headings and entry terms
- Descriptor identifiers, headings, alternate entry terms, and scope-note definitions
- A 15.9 MB deterministic compressed archive, expanded once into the application's private data folder
- Local trigram candidate search followed by typo-aware ranking
- Typical measured lookup time of approximately 12–35 ms on the Windows development computer; actual speed depends on hardware

The snapshot does not contain MeSH translations or the separately updated Supplementary Concept Record dataset. It is a reference vocabulary, not a complete medical dictionary or clinical decision-support system. The app identifies results as MeSH 2026 and warns that later NLM changes may not be included.

NLM freely provides MeSH data under its [MeSH terms and conditions](https://www.nlm.nih.gov/databases/download/terms_and_conditions_mesh.html). VibePBL acknowledges NLM, identifies the dataset version, disclaims endorsement, and provides a staleness notice. Source URLs, dates, scope, and reproducibility hashes are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Lookup performance and caching

- MeSH definitions are searched locally and do not require a network request.
- MedlinePlus uses a reused HTTPS client with separate provider throttling and bounded response sizes.
- Exact online responses are cached in SQLite for up to 30 days, with at most 250 saved searches.
- Up to 2,000 previously retrieved reference terms are retained for nearby local matching for up to 180 days.
- Memory caching avoids repeated database work during the current run.
- Cache limits and expiration prevent unbounded database growth.
- If the offline index cannot be extracted or validated, VibePBL still opens and can fall back to the online MeSH service.

### Web-search window

Google or DuckDuckGo results open in a separate isolated VibePBL window with a compact browser-style toolbar containing Back, Forward, the current HTTPS address, and Close controls. Remote websites cannot call session, image, printing, member, or glossary commands. HTTP, local-network addresses, local files, script URLs, downloads, Google account sign-in, and external pop-up windows are blocked.

## Offline data locations

Tauri resolves the operating system’s private application-data directory and creates a `vibepbl` folder containing:

- `vibepbl.db` — active session and app data
- `images/` — private copies of imported clinical images
- `reference/mesh-2026.sqlite` — automatically extracted read-only offline medical index

Deleting an image in the app also removes its private copied file. The original source image is never modified.

## Development

Prerequisites:

- Node.js 20 or newer
- Current Rust stable (the locked dependencies require at least Rust 1.88)
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
npm test
```

The committed offline medical index is reproducible from NLM's descriptor XML:

```sh
python scripts/build-mesh-index.py desc2026.gz mesh-2026.sqlite --version 2026 --updated-at 2026-08-12T18:33:47Z --gzip-output src-tauri/resources/mesh-2026.sqlite.gz
```

When updating the snapshot, use NLM's current English descriptor file, update the visible version/staleness notices and `THIRD_PARTY_NOTICES.md`, then verify both typo matching and package size. Do not add MeSH translation files; their terms are separate.

## Performance and reliability work

- Large repeated cards use deferred browser rendering where supported.
- The interface no longer runs a permanent whole-page mutation observer merely to disable saved-information autofill. Dynamic modal controls declare their own behavior directly.
- Autosaves are serialized, coalesced, retried after failures, and based on edit-time snapshots so older writes cannot overwrite newer edits.
- Pending edits are flushed before closing, resetting, or printing. A failed save keeps the application open and reports the problem.
- Drag ordering supports pointer movement, auto-scrolling, cancellation cleanup, and an accessible Alt+Up/Down keyboard alternative without visible arrow buttons.
- Presenter assignments use stable identifiers and survive problem reordering or shared learning-objective links.
- Printing waits for fonts and images and reports missing resources instead of silently producing incomplete output.
- Imported originals are never modified; VibePBL deletes only its private copied images.

## Verification and platform status

The current source has passed locally on Windows:

- Frontend syntax checks
- Randomizer and regression suites
- Rust formatting and strict Clippy checks with warnings treated as errors
- All 14 native unit tests, including offline-index extraction, typo/partial matching, persistent-cache reuse, Google and DuckDuckGo history handling, URL restrictions, presenter validation, session-data validation, and private-image deletion boundaries
- A full native desktop smoke test covering all eight routes, Thai text, actual pointer drag reordering, shared problem links, glossary creation, live MedlinePlus, offline MeSH, DuckDuckGo toolbar navigation and isolation, presenter draws, sidebar and Retro layouts, image zoom/highlights, print preview, reset, autosave, close, and reopen
- No captured frontend or native errors during the completed smoke test

Offline lookup measured approximately 12–35 ms during those native checks. This is a development-machine measurement, not a guaranteed benchmark.

Windows has received a complete native test pass. Windows and macOS checks are configured in GitHub Actions. No physical Mac was available for the latest manual pass, so first launch, image selection, printing/Save as PDF, Cmd+Q persistence, dragging, and both Intel and Apple Silicon packages should be checked on real Macs before release. The macOS print implementation requires macOS 11 or newer.

Testing reduces known regressions but cannot prove that the application has no bugs. Please report reproducible problems with the operating system, VibePBL version, page, and steps that triggered them.

## Compile from source on macOS

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

- Core workspace features and MeSH definition search perform no network requests and load no CDN assets. MedlinePlus contacts a fixed HTTPS NLM service only on explicit search; the separate web-search window loads the websites the user visits.
- Database field names accepted by native commands are explicitly allow-listed.
- Image deletion is restricted to the app’s private images directory.
- Session information remains on the local device unless a user explicitly shares a printout or files, or submits text in the medical lookup search field.

VibePBL is an educational organization tool. It does not provide medical advice, diagnosis, or clinical decision support.

## Releasing

When a version tag such as `v2.0.0` is pushed, GitHub Actions publishes the standalone Windows executable and a universal macOS DMG. MSI, NSIS, and PKG assets are not produced. Configure repository Actions permissions to allow release creation. The Windows build is unsigned; the macOS build is ad-hoc signed and not notarized, so operating-system warnings may appear.

## License

The VibePBL application source is released under the MIT License. Bundled third-party material remains under its own terms as documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

VibePBL was built by ChatGPT Codex under the project maintainer's direction. Use of AI-assisted development does not change the application's license, third-party obligations, or the maintainer's responsibility for reviewing and releasing the software.
