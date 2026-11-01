import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
test("Apps Script bridge authorizes backend writes, reuses the tournament workbook and ignores older snapshots", async () => {
  const properties = new Map([
      ["BOUNDARY_WEBHOOK_SECRET", "test-shared-secret-at-least-32-characters"],
    ]),
    books = new Map();
  let created = 0,
    locked = false;
  function book(name) {
    const id = "book-" + ++created,
      sheets = new Map();
    const b = {
      name,
      id,
      getId: () => id,
      getUrl: () => `https://docs.google.com/spreadsheets/d/${id}/edit`,
      getSheetByName: (n) => sheets.get(n),
      insertSheet(n) {
        const s = {
          values: [],
          getMaxRows: () => 1000,
          getMaxColumns: () => 24,
          getDataRange() {
            return {
              clearContent() {
                s.values = [];
              },
            };
          },
          getRange() {
            return {
              setValues(v) {
                s.values = v;
              },
              setFontWeight() {
                return this;
              },
              setBackground() {
                return this;
              },
              setFontColor() {
                return this;
              },
            };
          },
          setFrozenRows() {},
        };
        sheets.set(n, s);
        return s;
      },
    };
    books.set(id, b);
    return b;
  }
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => properties.get(k) || null,
        setProperty: (k, v) => properties.set(k, v),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          locked = true;
        },
        hasLock: () => locked,
        releaseLock() {
          locked = false;
        },
      }),
    },
    SpreadsheetApp: {
      create: book,
      openById: (id) => books.get(id),
      flush() {},
    },
    DriveApp: { getFilesByName: () => ({ hasNext: () => false }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
  });
  vm.runInContext(
    await fs.readFile(
      new URL("../google-sheets/Code.gs", import.meta.url),
      "utf8",
    ),
    context,
  );
  const send = (body) =>
    JSON.parse(
      context.doPost({ postData: { contents: JSON.stringify(body) } }).text,
    );
  const request = {
    secret: properties.get("BOUNDARY_WEBHOOK_SECRET"),
    tournamentId: "test-tournament-00001",
    name: "Season One",
    version: 1,
    data: ["Registrations", "Teams", "Auction", "Settings"].map((tab) => ({
      range: tab + "!A1",
      values: [["Header"], ["Player"]],
    })),
  };
  assert.equal(send({ ...request, secret: "wrong" }).success, false);
  assert.equal(created, 0);
  const first = send(request);
  assert.equal(first.success, true);
  assert.equal(created, 1);
  assert.equal(locked, false);
  const second = send({ ...request, version: 2 });
  assert.equal(second.spreadsheetId, first.spreadsheetId);
  assert.equal(created, 1);
  const third = send({
    ...request,
    version: 0,
    data: request.data.map((d) => ({
      ...d,
      values: [["Old header"], ["Stale data"]],
    })),
  });
  assert.equal(third.success, true);
  assert.equal(
    books.get(first.spreadsheetId).getSheetByName("Registrations").values[1][0],
    "Player",
  );
  assert.equal(
    send({ ...request, tournamentId: "test-tournament-00002" }).success,
    true,
  );
  assert.equal(created, 2);
});
