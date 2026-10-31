// Derived from preserved SynthAi 5.8 host; original retained under lineage/android58.
package com.fourcorners.computer;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Runs Synthia 5.8 ({@code node src/ui/server.mjs} in /opt/fantastic4) inside the
 * embedded ARM64 Alpine rootfs through the same PRoot bridge the Venom face uses.
 * Loopback only: PORT 4183, hand bridge 8797, data under app files (synthia58-data).
 */
final class LinuxRuntime {
    static final String GUEST_APP_DIR = "/opt/fantastic4";
    static final String GUEST_ENTRY = "/opt/fantastic4/server.mjs";
    static final String GUEST_DATA_MOUNT = "/var/lib/synthai";
    static final String GUEST_DATA_DIR = "/var/lib/synthai";

    private static volatile boolean ready;
    private static volatile String failure;

    private final Context context;
    private final String sessionToken;
    private final StringBuilder outputTail = new StringBuilder();
    private volatile Process process;
    private volatile boolean verified;

    LinuxRuntime(Context context, String sessionToken) {
        this.sessionToken = sessionToken;
        this.context = context.getApplicationContext();
    }

    static boolean isReady() {
        return ready;
    }

    static String failure() {
        return failure;
    }

    static void markFailure(String message) {
        ready = false;
        failure = message;
    }

    boolean isVerified() {
        return verified && isAlive(process);
    }

    void startAndVerify() throws Exception {
        ready = false;
        failure = null;
        if (!supportsArm64()) {
            throw new UnsupportedOperationException(
                    "embedded Synthia 5.8 runtime is ARM64; device ABIs=" + Arrays.toString(Build.SUPPORTED_ABIS));
        }

        LinuxRootfsInstaller.Result installed = LinuxRootfsInstaller.installIfNeeded(context);
        File guestData = installed.data;
        if (!guestData.exists() && !guestData.mkdirs()) {
            throw new IllegalStateException("cannot create Synthia data directory " + guestData);
        }

        Exception firstFailure;
        try {
            launch(installed, false);
            verifyGuestRuntime();
            markReady(installed, false);
            return;
        } catch (Exception error) {
            firstFailure = error;
            Log.w("Fantastic4", "HOVER_RUNTIME_FIRST_BOOT_FAILED " + error.getMessage());
            stop();
        }

        synchronized (this) { outputTail.setLength(0); }
        launch(installed, true);
        try {
            verifyGuestRuntime();
            markReady(installed, true);
        } catch (Exception secondFailure) {
            stop();
            throw new IllegalStateException(
                    "Synthia 5.8 runtime failed normal and no-seccomp boot. first="
                            + firstFailure.getMessage() + " second=" + secondFailure.getMessage()
                            + " tail=" + tail(), secondFailure);
        }
    }

    private void markReady(LinuxRootfsInstaller.Result installed, boolean noSeccomp) {
        verified = true;
        ready = true;
        failure = null;
        Log.i("Fantastic4", "HOVER_RUNTIME_READY=true url=" + "http://127.0.0.1:4183"
                + " rootfs=" + installed.version + " noSeccomp=" + noSeccomp);
    }

    private void launch(LinuxRootfsInstaller.Result installed, boolean noSeccomp) throws Exception {
        File nativeDir = new File(context.getApplicationInfo().nativeLibraryDir);
        File proot = new File(nativeDir, "libproot.so");
        File loader = new File(nativeDir, "libproot-loader.so");
        File loader32 = new File(nativeDir, "libproot-loader32.so");

        requireFile(proot, "PRoot");
        requireFile(loader, "PRoot 64-bit loader");

        File tmp = new File(context.getFilesDir(), "proot-tmp");
        if (!tmp.exists()) tmp.mkdirs();

        List<String> command = new ArrayList<>();
        command.add(proot.getAbsolutePath());
        command.add("-0");
        command.add("--link2symlink");
        command.add("-r");
        command.add(installed.rootfs.getAbsolutePath());
        command.add("-b");
        command.add("/dev");
        command.add("-b");
        command.add("/proc");
        command.add("-b");
        command.add("/sys");
        command.add("-b");
        command.add(installed.data.getAbsolutePath() + ":" + GUEST_DATA_MOUNT);
        command.add("-w");
        command.add(GUEST_APP_DIR);
        command.add("/usr/local/bin/node");
        command.add(GUEST_ENTRY);

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectErrorStream(true);
        Map<String, String> env = builder.environment();
        env.put("PROOT_TMP_DIR", tmp.getAbsolutePath());
        env.put("PROOT_LOADER", loader.getAbsolutePath());
        if (loader32.isFile()) env.put("PROOT_LOADER_32", loader32.getAbsolutePath());
        env.put("LD_LIBRARY_PATH", nativeDir.getAbsolutePath());
        env.put("HOME", "/root");
        env.put("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
        env.put("TMPDIR", "/tmp");
        // Synthia 5.8 reads PORT / SYNTHIA_DATA_DIR / SYNTHIA_ANDROID_BRIDGE_URL; it binds 127.0.0.1 itself.
        env.put("HOST", "127.0.0.1");
        env.put("PORT", String.valueOf(4183));
        env.put("SYNTHIA_DATA_DIR", GUEST_DATA_DIR);
        env.put("NODE_ENV", "production");
        env.put("FANTASTIC4_TOKEN", sessionToken);
        if (noSeccomp) env.put("PROOT_NO_SECCOMP", "1");

        process = builder.start();
        final Process started = process;
        Thread reader = new Thread(() -> drain(started), "Synthia-Hover-Linux-output");
        reader.setDaemon(true);
        reader.start();
        Log.i("Fantastic4", "HOVER_RUNTIME_PROCESS_STARTED entry=" + GUEST_ENTRY + " noSeccomp=" + noSeccomp);
    }

    private void verifyGuestRuntime() throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 180_000L;
        Exception last = null;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (!isAlive(process)) {
                throw new IllegalStateException("PRoot guest exited before Synthia 5.8 became ready: " + tail());
            }
            try {
                String status = get("/api/status");
                if (!status.contains("\"ok\":true")) {
                    throw new IllegalStateException("unexpected /api/status: " + clip(status));
                }
                if (!status.contains("\"runtime\":\"fantastic4-linux\"")) {
                    throw new IllegalStateException("Unexpected Linux runtime identity");
                }
                return;
            } catch (Exception error) {
                last = error;
                SystemClock.sleep(500);
            }
        }
        throw new IllegalStateException("Synthia 5.8 did not become ready: "
                + (last == null ? "unknown" : last.getMessage()) + " tail=" + tail());
    }

    private String get(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:4183" + path).openConnection();
        connection.setConnectTimeout(1200);
        connection.setReadTimeout(4000);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + sessionToken);
        int code = connection.getResponseCode();
        java.io.InputStream stream = code >= 200 && code < 400
                ? connection.getInputStream()
                : connection.getErrorStream();
        StringBuilder response = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line).append('\n');
            }
        }
        connection.disconnect();
        if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code + " " + clip(response.toString()));
        return response.toString();
    }

    private static String clip(String value) {
        return value.length() > 300 ? value.substring(0, 300) + "…" : value;
    }

    private void drain(Process source) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(source.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                appendTail(line);
                Log.i("Fantastic4", "LINUX " + line);
            }
        } catch (Exception error) {
            Log.w("Fantastic4", "Linux output reader ended: " + error.getMessage());
        }
    }

    private synchronized void appendTail(String line) {
        outputTail.append(line).append('\n');
        if (outputTail.length() > 12000) outputTail.delete(0, outputTail.length() - 12000);
    }

    private synchronized String tail() {
        return outputTail.toString();
    }

    void stop() {
        verified = false;
        ready = false;
        Process current = process;
        process = null;
        if (current != null) {
            try { current.destroy(); } catch (Throwable ignored) {}
            SystemClock.sleep(150);
            if (isAlive(current)) {
                try { current.destroyForcibly(); } catch (Throwable ignored) {}
            }
        }
    }

    private static boolean supportsArm64() {
        for (String abi : Build.SUPPORTED_ABIS) if ("arm64-v8a".equals(abi)) return true;
        return false;
    }

    private static boolean isAlive(Process value) {
        if (value == null) return false;
        try {
            value.exitValue();
            return false;
        } catch (IllegalThreadStateException running) {
            return true;
        }
    }

    private static void requireFile(File file, String label) {
        if (!file.isFile()) throw new IllegalStateException(label + " missing: " + file);
    }
}
