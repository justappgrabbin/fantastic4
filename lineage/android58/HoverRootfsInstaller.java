package app.synthai.hover;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;
import android.util.Log;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Hover-face copy of the Venom RootfsInstaller (kept separate so Venom stays byte-identical).
 * Differences: log tag, data dir name, and the guest entry that must exist (Synthia 5.8).
 */
final class HoverRootfsInstaller {
    private static final String TAG = HoverPorts.TAG;
    // Android's asset packager expands .gz assets and removes the suffix.
    private static final String ROOTFS_ASSET = "linux-rootfs.bundle";
    private static final String VERSION_ASSET = "linux-rootfs.version";

    static final class Result {
        final File rootfs;
        final File data;
        final String version;

        Result(File rootfs, File data, String version) {
            this.rootfs = rootfs;
            this.data = data;
            this.version = version;
        }
    }

    private static final class PendingHardLink {
        final File destination;
        final String target;

        PendingHardLink(File destination, String target) {
            this.destination = destination;
            this.target = target;
        }
    }

    private HoverRootfsInstaller() {}

    static synchronized Result installIfNeeded(Context context) throws Exception {
        File linuxBase = new File(context.getFilesDir(), "synthai-linux");
        File rootfs = new File(linuxBase, "rootfs");
        File marker = new File(linuxBase, "rootfs.version");
        File data = new File(context.getFilesDir(), "synthia58-data");
        if (!linuxBase.exists() && !linuxBase.mkdirs()) {
            throw new IOException("cannot create Linux base directory");
        }
        if (!data.exists() && !data.mkdirs()) {
            throw new IOException("cannot create persistent Synthia data directory");
        }
        deleteLeftoverStaging(linuxBase);

        String wanted = readAssetText(context, VERSION_ASSET).trim();
        String installed = marker.isFile() ? readFileText(marker).trim() : "";

        if (wanted.equals(installed)
                && present(new File(rootfs, "bin/sh"))
                && new File(rootfs, "usr/local/bin/node").isFile()
                && new File(rootfs, "opt/synthia58/src/ui/server.mjs").isFile()) {
            Log.i(TAG, "ROOTFS_READY version=" + wanted + " source=existing");
            return new Result(rootfs, data, wanted);
        }

        File staging = new File(linuxBase, "rootfs.staging-" + System.currentTimeMillis());
        deleteRecursively(staging);
        if (!staging.mkdirs()) throw new IOException("cannot create rootfs staging directory");

        Log.i(TAG, "ROOTFS_INSTALL_START version=" + wanted);
        File old = new File(linuxBase, "rootfs.old");
        boolean activated = false;
        try {
            extract(context, staging);

            require(new File(staging, "bin/sh"), "guest shell");
            require(new File(staging, "usr/local/bin/node"), "guest Node runtime");
            require(new File(staging, "opt/synthia58/src/ui/server.mjs"), "Synthia 5.8 front screen server");

            deleteRecursively(old);
            if (rootfs.exists() && !rootfs.renameTo(old)) {
                throw new IOException("cannot rotate previous rootfs");
            }
            if (!staging.renameTo(rootfs)) {
                if (old.exists()) old.renameTo(rootfs);
                throw new IOException("cannot activate new rootfs");
            }
            activated = true;
        } finally {
            if (!activated) deleteRecursively(staging);
        }
        deleteRecursively(old);
        writeFileText(marker, wanted + "\n");

        Log.i(TAG, "ROOTFS_READY version=" + wanted + " source=installed");
        return new Result(rootfs, data, wanted);
    }

    private static void extract(Context context, File root) throws Exception {
        List<PendingHardLink> hardLinks = new ArrayList<>();
        String rootPath = root.getCanonicalPath() + File.separator;

        try (InputStream raw = context.getAssets().open(ROOTFS_ASSET);
             BufferedInputStream buffered = new BufferedInputStream(raw, 128 * 1024);
             GzipCompressorInputStream gzip = new GzipCompressorInputStream(buffered);
             TarArchiveInputStream tar = new TarArchiveInputStream(gzip)) {

            TarArchiveEntry entry;
            byte[] buffer = new byte[128 * 1024];

            while ((entry = tar.getNextTarEntry()) != null) {
                String name = cleanEntryName(entry.getName());
                if (name.isEmpty()) continue;

                File destination = checked(root, rootPath, name);
                File parent = destination.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new IOException("cannot create parent for " + name);
                }

                if (entry.isDirectory()) {
                    if (!destination.exists() && !destination.mkdirs()) {
                        throw new IOException("cannot create directory " + name);
                    }
                    chmod(destination, entry.getMode());
                    continue;
                }

                if (entry.isSymbolicLink()) {
                    if (destination.exists()) deleteRecursively(destination);
                    Os.symlink(entry.getLinkName(), destination.getAbsolutePath());
                    continue;
                }

                if (entry.isLink()) {
                    hardLinks.add(new PendingHardLink(destination, cleanEntryName(entry.getLinkName())));
                    continue;
                }

                if (!entry.isFile()) {
                    Log.w(TAG, "ROOTFS_SKIP_SPECIAL " + name);
                    continue;
                }

                try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(destination), 128 * 1024)) {
                    int read;
                    while ((read = tar.read(buffer)) != -1) out.write(buffer, 0, read);
                }
                chmod(destination, entry.getMode());
            }
        }

        int copied = 0;
        for (PendingHardLink link : hardLinks) {
            File target = new File(root, link.target);
            boolean targetIsSymlink = Files.isSymbolicLink(target.toPath());
            if (targetIsSymlink) {
                checkedParent(rootPath, target, link.target);
            } else {
                target = checked(root, rootPath, link.target);
                if (!target.isFile()) throw new IOException("hardlink target missing: " + link.target);
            }
            File parent = link.destination.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IOException("cannot create parent for " + link.destination);
            }
            if (link.destination.exists() || Files.isSymbolicLink(link.destination.toPath())) {
                deleteRecursively(link.destination);
            }
            if (targetIsSymlink) {
                // A hard link to a symlink is just another symlink with the same text.
                Os.symlink(Os.readlink(target.getAbsolutePath()), link.destination.getAbsolutePath());
                continue;
            }
            try {
                Os.link(target.getAbsolutePath(), link.destination.getAbsolutePath());
            } catch (ErrnoException error) {
                // Android SELinux denies link() in app data (EACCES); store an independent copy instead.
                Files.copy(target.toPath(), link.destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
                chmod(link.destination, Os.stat(target.getAbsolutePath()).st_mode);
                copied++;
            }
        }
        if (copied > 0) {
            Log.i(TAG, "ROOTFS_HARDLINKS_COPIED count=" + copied + " of=" + hardLinks.size());
        }
    }

    private static void checkedParent(String rootPath, File file, String name) throws Exception {
        File parent = file.getParentFile();
        String canonical = parent == null ? "" : parent.getCanonicalPath() + File.separator;
        if (!canonical.startsWith(rootPath)) {
            throw new IOException("rootfs path traversal refused: " + name);
        }
    }

    private static File checked(File root, String rootPath, String name) throws Exception {
        File out = new File(root, name);
        String canonical = out.getCanonicalPath();
        if (!canonical.startsWith(rootPath)) {
            throw new IOException("rootfs path traversal refused: " + name);
        }
        return out;
    }

    private static String cleanEntryName(String name) {
        String value = name == null ? "" : name.replace('\\', '/');
        while (value.startsWith("./")) value = value.substring(2);
        while (value.startsWith("/")) value = value.substring(1);
        if (value.contains("../") || value.equals("..")) return "";
        return value;
    }

    private static void chmod(File file, int mode) {
        try {
            Os.chmod(file.getAbsolutePath(), mode & 0777);
        } catch (Throwable error) {
            Log.w(TAG, "chmod failed for " + file + ": " + error.getMessage());
        }
    }

    // Guest symlinks such as Alpine's bin/sh -> /bin/busybox are absolute inside the guest, so
    // they must not be resolved against the Android host filesystem.
    private static boolean present(File file) {
        return file.isFile() || Files.isSymbolicLink(file.toPath());
    }

    private static void require(File file, String label) throws IOException {
        if (!present(file)) throw new IOException("rootfs missing " + label + ": " + file);
    }

    private static String readAssetText(Context context, String name) throws IOException {
        try (InputStream in = context.getAssets().open(name)) {
            return readAll(in);
        }
    }

    private static String readFileText(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            return readAll(in);
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static void writeFileText(File file, String value) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void deleteLeftoverStaging(File linuxBase) {
        File[] children = linuxBase.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.getName().startsWith("rootfs.staging-")) {
                Log.i(TAG, "ROOTFS_STAGING_CLEANUP " + child.getName());
                deleteRecursively(child);
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null) return;
        boolean symlink = Files.isSymbolicLink(file.toPath());
        if (!symlink && !file.exists()) return;
        if (!symlink && file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        if (!file.delete() && file.exists()) {
            Log.w(TAG, "could not delete " + file);
        }
    }
}
