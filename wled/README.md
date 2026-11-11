# WLED configuration

This folder is for the frame's WLED configuration, exported from the real controller: `cfg.json` (every setting — LED outputs, brightness limiter, network, hostname) and `presets.json` (the saved looks and playlists).

It is empty on purpose. A configuration is only worth keeping once it has been tested on the frame, so nothing here is written by hand. Export the files once the bench test in the [build manual](../docs/build-manual.md) passes (§ 08, step 10), and again whenever you change a setting or a preset you want to keep.

Checked against the WLED 16.0.1 source; the menu names below are from that version.

## Export

In the WLED web page: **Config → Security & Updates → Backup & Restore**.

- **Backup configuration** downloads `cfg.json`.
- **Backup presets** downloads `presets.json`.

From a terminal, the same two files:

```bash
curl -o cfg.json http://life-frame.local/cfg.json
```

```bash
curl -o presets.json http://life-frame.local/presets.json
```

Put them in this folder and commit them. WLED leaves passwords out of the backup ("For security reasons, passwords are not backed up"), so the files should be safe to commit — but open `cfg.json` and check before you push to a public repository.

## Restore

Same page, **Config → Security & Updates → Backup & Restore**:

- **Restore configuration**: choose `cfg.json`, then **Upload**. WLED restarts by itself with the restored settings.
- **Restore presets**: choose `presets.json`, then **Upload**.

Restoring **overwrites** what is on the controller. If the settings PIN is set, unlock it first, or the upload is refused.

From a terminal:

```bash
curl -F "data=@cfg.json;filename=/cfg.json" http://life-frame.local/upload
```

```bash
curl -F "data=@presets.json;filename=/presets.json" http://life-frame.local/upload
```

## On a new or reflashed board

The restored `cfg.json` brings the Ethernet type with it, but a freshly flashed board cannot use Ethernet until that setting is there. So: flash the **ESP32 Ethernet** build, join the `WLED-AP` hotspot once (§ 08, step 08), restore `cfg.json` from there, and let it restart onto the cable. Then restore `presets.json`.

`cfg.json` describes Build A or Build B, not both: the LED outputs, pixel counts, LED type and brightness limiter differ (§ 09). If both builds ever exist, keep one export per build, for example in `build-a/` and `build-b/`.
