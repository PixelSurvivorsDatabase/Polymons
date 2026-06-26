import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const androidDirectory = resolve(process.argv[2] || "android");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const isStudio = androidDirectory.endsWith("android-studio");
const apkSource = resolve(androidDirectory, "app/build/outputs/apk/debug/app-debug.apk");
const apkDestination = resolve(
  isStudio ? "studio-release" : "release",
  isStudio ? "Poly Studio.apk" : "Polymons Player.apk",
);
const androidStudioJavaHome = "C:\\Program Files\\Android\\Android Studio\\jbr";
const javaHome =
  process.platform === "win32" && existsSync(androidStudioJavaHome)
    ? androidStudioJavaHome
    : process.env.JAVA_HOME;

if (!existsSync(resolve(androidDirectory, wrapper))) {
  throw new Error("Android project is missing. Run `npx cap add android` first.");
}

const child = spawn(wrapper, ["assembleDebug", "--no-daemon", "--console=plain", "--max-workers=1"], {
  cwd: androidDirectory,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ...(javaHome
      ? {
          JAVA_HOME: javaHome,
          PATH: `${resolve(javaHome, "bin")}${delimiter}${process.env.PATH ?? ""}`,
        }
      : {}),
  },
});

child.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }
  if (!existsSync(apkSource)) {
    console.error(`Expected APK was not created: ${apkSource}`);
    process.exit(1);
    return;
  }
  mkdirSync(resolve(apkDestination, ".."), { recursive: true });
  copyFileSync(apkSource, apkDestination);
  const sizeMb = (statSync(apkDestination).size / 1024 / 1024).toFixed(2);
  console.log(`Copied Android APK to ${apkDestination} (${sizeMb} MB).`);
  process.exit(0);
});
