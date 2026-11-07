/** Runs once after J6 (which resets per test): the paying journeys share one store for the 11.4 report. */
import { test } from "@playwright/test";
import { resetStore } from "./helpers.ts";

test("reset the file store before the paying journeys", async () => {
  await resetStore();
});
