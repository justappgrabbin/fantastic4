# Fantastic4

Native Android interface + self-hosted Linux engine built from the owner's existing code. Four corner workers coordinate preserved Automatons: Tool Factory, Neural Net Maker, Model Maker and ATO Engine.

## What is connected

- Original Integrated Tool Factory creates, executes and exports bounded executable tools.
- Original ATO Core creates and runs typed multi-tool meshes.
- Original Adaya MCPHub routes work to four distinct tool belts with separate queues. The adapter requires output artifacts and checksums, replacing the hub's permissive default success check without editing the original module.
- Original neural architecture generator creates and evaluates lightweight compositions. These are the source's mathematical surrogates, not full production transformer/diffusion/GAN models.
- Original Stellarproximology Modelmaker source and contracts are retained. Its corner can inspect requirements; actual training is not provisioned.
- Jobs, failures and artifacts persist on the phone. Interrupted jobs are reported as interrupted after restart.

This is not yet an autonomous self-building computer. No language-model planner is installed. Personal Human Design and SpaceTime configuration adapters remain unconnected; no personalized dimensional assignment has been invented. Incoming packages are preserved and listed, not automatically executed or integrated.

## Existing Linux host

The Android launcher/installer and ARM64 Alpine/Node/PRoot build derive from SynthAi's preserved 5.8 branch at `d901b3e15aa7c99a32fbb15e9b0680d77243249b`. Originals remain under `lineage/android58`; derived files point to Fantastic4's runtime and private data. This does not replace an installed SynthAi app or its data. UI uses Android widgets, no WebView and no remote website.

GitHub Actions builds the ARM64 rootfs, tests the engine on ARM64 under QEMU, builds the pinned PRoot host and assembles/lints the APK. Download the `Fantastic4-native-Android-arm64` artifact from a successful run. APK compilation and Linux/QEMU tests do not prove PRoot works on a physical Android device. No Android runtime acceptance is claimed until installed and tested on an ARM64 phone.

The host currently runs while the Activity exists; reliable background service operation and lifecycle recovery require further work. The Modelmaker training dependencies are not bundled. Do not uninstall existing apps or discard their data for this build.

## Verification

    node scripts/verify-lineage.mjs
    node --test runtime/test/*.test.mjs
    node --test runtime/vendor/ato-core/test/*.test.mjs
    python -m unittest discover -s runtime/vendor/modelmaker -p test_contracts.py -v

`node runtime/test/http-smoke.mjs` tests authenticated loopback execution and restart persistence on hosts permitting sockets. Local sandbox blocks sockets; Actions runs this check instead.

`lineage/SOURCES.json` records source locations and SHA-256 hashes. Original source files are unchanged. Factory's supplied bridge test expects a sibling `ato-core-native-test` directory; integrated runtime tests exercise the same real bridge using preserved ATO files at their actual vendored path.
