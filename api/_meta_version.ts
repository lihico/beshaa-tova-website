/**
 * The one Graph API version for every Meta call (CAPI, insights, ad drafts). PLAN.md Stage 2.
 *
 * Source: https://developers.facebook.com/docs/graph-api/changelog/versions (read 2026-11-07).
 * On that date the table listed v26.0 (released 2026-07-29, expiration TBD) as the newest version,
 * then v25.0 (expires 2028-07-29) and v24.0 (expires 2028-02-18). v21.0, used before, expires 2027-01-21.
 * Change it here only, after checking the same page.
 */
export const META_GRAPH_VERSION = "v26.0";

export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
