import { describe, expect, it } from "vitest";
import { crc32, createZip, readZip } from "./zipWriter.js";

const text = (value) => new TextEncoder().encode(value);

describe("ZIP writer", () => {
  it.each([
    ["", 0x00000000],
    ["a", 0xe8b7be43],
    ["123456789", 0xcbf43926],
    ["The quick brown fox jumps over the lazy dog", 0x414fa339],
  ])("computes the standard CRC-32 of %j", (value, expected) => {
    expect(crc32(text(value))).toBe(expected);
  });

  it("round-trips files, including UTF-8 names and empty files", () => {
    const files = [
      { name: "manifest.json", bytes: text('{"ok":true}') },
      { name: "çankaya-report.md", bytes: text("# Rapor\nŞehir") },
      { name: "empty.txt", bytes: new Uint8Array(0) },
    ];
    const archive = createZip(files);
    const read = readZip(archive);
    expect(read.map((file) => file.name)).toEqual(files.map((file) => file.name));
    read.forEach((file, index) => expect(Array.from(file.bytes)).toEqual(Array.from(files[index].bytes)));
  });

  it("is deterministic for the same files and timestamp", () => {
    const files = [{ name: "a.txt", bytes: text("A") }];
    const modifiedAt = new Date("2026-10-18T12:34:56Z");
    expect(Array.from(createZip(files, { modifiedAt }))).toEqual(Array.from(createZip(files, { modifiedAt })));
  });

  it.each([["/abs.txt"], ["../escape.txt"], ["dir\\file.txt"], [""]])("rejects the unsafe entry name %j", (name) => {
    expect(() => createZip([{ name, bytes: text("x") }])).toThrow(/Invalid ZIP entry name/);
  });

  it("rejects duplicate names and detects corruption", () => {
    expect(() => createZip([{ name: "a", bytes: text("1") }, { name: "a", bytes: text("2") }])).toThrow(/Duplicate/);
    const archive = createZip([{ name: "a.txt", bytes: text("payload") }]);
    archive[30 + "a.txt".length] ^= 0xff;
    expect(() => readZip(archive)).toThrow(/CRC mismatch/);
  });
});
