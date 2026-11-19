import assert from "node:assert/strict";
import test from "node:test";
import {
  actionTokenReducer,
  readActionToken,
  removeActionTokenFromUrl,
  submitActionToken,
} from "../src/utils/actionToken.js";

function makeLocation(value) {
  const url = new URL(value);
  return { href: url.href, search: url.search, hash: url.hash };
}

function createHistory() {
  return {
    state: { key: "history-key" },
    calls: [],
    replaceState(state, title, url) {
      this.calls.push({ state, title, url });
    },
  };
}

test("fragment tokens take precedence over legacy query tokens", () => {
  const location = makeLocation(
    "https://app.linkbase.co.za/claim?token=legacy#token=fragment",
  );

  assert.equal(readActionToken(location), "fragment");
});

test("legacy query-string links remain readable", () => {
  const location = makeLocation(
    "https://app.linkbase.co.za/reset-password?token=legacy-token",
  );

  assert.equal(readActionToken(location), "legacy-token");
});

test("fragment tokens are immediately removed from the current history entry", () => {
  const location = makeLocation(
    "https://app.linkbase.co.za/claim#token=secret-fragment&campaign=email",
  );
  const history = createHistory();
  const token = readActionToken(location);

  assert.equal(removeActionTokenFromUrl(location, history), true);
  assert.deepEqual(history.calls, [{
    state: history.state,
    title: "",
    url: "/claim#campaign=email",
  }]);
  assert.equal(token, "secret-fragment");
  assert.doesNotMatch(history.calls[0].url, /secret-fragment|token=/);
});

test("query tokens are immediately removed while unrelated query values remain", () => {
  const location = makeLocation(
    "https://app.linkbase.co.za/reset-password?source=email&token=secret-query",
  );
  const history = createHistory();
  const token = readActionToken(location);

  assert.equal(removeActionTokenFromUrl(location, history), true);
  assert.equal(history.calls[0].url, "/reset-password?source=email");
  assert.equal(token, "secret-query");
  assert.doesNotMatch(history.calls[0].url, /secret-query|token=/);
});

test("a successful claim or reset submits the saved token then clears token state", async () => {
  for (const endpoint of ["/api/auth/claim", "/api/auth/password-reset/complete"]) {
    let tokenState = "one-time-token";
    let request;
    let successData;

    await submitActionToken({
      endpoint,
      token: tokenState,
      password: "valid-password",
      errorMessage: "Could not complete action",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          async json() {
            return { message: "Completed" };
          },
        };
      },
      clearToken: () => {
        tokenState = actionTokenReducer(tokenState, { type: "clear" });
      },
      onSuccess: (data) => {
        successData = data;
      },
    });

    assert.equal(request.url, endpoint);
    assert.deepEqual(JSON.parse(request.options.body), {
      token: "one-time-token",
      password: "valid-password",
    });
    assert.equal(tokenState, "");
    assert.deepEqual(successData, { message: "Completed" });
  }
});

test("invalid or expired token responses keep token state for error handling", async () => {
  let tokenState = "one-time-token";

  await assert.rejects(
    submitActionToken({
      endpoint: "/api/auth/claim",
      token: tokenState,
      password: "valid-password",
      errorMessage: "Could not claim profile",
      fetchImpl: async () => ({
        ok: false,
        async json() {
          return { message: "Invitation is invalid or expired" };
        },
      }),
      clearToken: () => {
        tokenState = actionTokenReducer(tokenState, { type: "clear" });
      },
      onSuccess: () => assert.fail("onSuccess should not run for an error"),
    }),
    /Invitation is invalid or expired/,
  );

  assert.equal(tokenState, "one-time-token");
});
