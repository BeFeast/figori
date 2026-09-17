import { expect, test } from "bun:test";
import { OperationGate } from "./operation";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
test("pending save owns the document until response and blocks a racing New/Open", async () => {
  const gate = new OperationGate();
  const dialog = deferred<string>();
  let doc = { source: "old", path: "old.numi" };
  const save = gate.run(async () => {
    const path = await dialog.promise;
    doc = { ...doc, path };
    return true;
  }, false);
  expect(
    await gate.run(async () => {
      doc = { source: "new", path: "new.numi" };
      return true;
    }, false),
  ).toBe(false);
  expect(doc).toEqual({ source: "old", path: "old.numi" });
  dialog.resolve("saved.numi");
  expect(await save).toBe(true);
  expect(doc).toEqual({ source: "old", path: "saved.numi" });
});
test("startup remains locked until hydration and cancellation/failure release the gate", async () => {
  const states: boolean[] = [];
  const gate = new OperationGate((value) => states.push(value));
  const hydrate = deferred<void>();
  const startup = gate.run(() => hydrate.promise, undefined);
  expect(gate.active).toBe(true);
  expect(await gate.run(async () => "open", "blocked")).toBe("blocked");
  hydrate.resolve();
  await startup;
  expect(gate.active).toBe(false);
  await expect(
    gate.run(async () => {
      throw new Error("dialog failure");
    }, false),
  ).rejects.toThrow("dialog failure");
  expect(gate.active).toBe(false);
  expect(states).toEqual([true, false, true, false]);
});
test("Save from a close prompt uses the owner's internal operation without a nested gate", async () => {
  const gate = new OperationGate();
  let saved = false,
    closed = false;
  const saveUnlocked = async () => {
    expect(gate.active).toBe(true);
    saved = true;
    return true;
  };
  await gate.run(async () => {
    if (await saveUnlocked()) closed = true;
  }, undefined);
  expect(saved).toBe(true);
  expect(closed).toBe(true);
  expect(gate.active).toBe(false);
});
