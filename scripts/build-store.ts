if (process.platform !== "win32") {
  throw new Error("The Microsoft Store package must be built on Windows.");
}

process.env.NOTEDROP_DISTRIBUTION = "microsoft-store";
process.env.MSIX_IDENTITY_NAME ??= "30994AppZoid.Notedrop";
process.env.MSIX_PUBLISHER ??= "CN=B639AD35-F99E-4559-BBD2-483BFCF47753";
process.env.MSIX_PUBLISHER_DISPLAY_NAME ??= "AppZoid";
process.env.MSIX_APPLICATION_ID ??= "NOTEDROP";

await import("../desktop/build.ts");
