export function readActionToken(location) {
  const fragment = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const fragmentToken = fragment.get("token");
  if (fragmentToken) return fragmentToken;

  return new URLSearchParams(location.search || "").get("token") || "";
}

export function removeActionTokenFromUrl(location, history) {
  const url = new URL(location.href);
  const search = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hadToken = search.has("token") || fragment.has("token");

  if (!hadToken) return false;

  search.delete("token");
  fragment.delete("token");
  url.search = search.toString();
  url.hash = fragment.toString();

  history.replaceState(
    history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  return true;
}

export function actionTokenReducer(token, action) {
  return action.type === "clear" ? "" : token;
}

export async function submitActionToken({
  endpoint,
  token,
  password,
  errorMessage,
  clearToken,
  onSuccess,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.message || errorMessage);

  clearToken();
  onSuccess(data);
  return data;
}
