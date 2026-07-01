// Blogger Provider. OAuth 연결 및 실제 글 발행(posts.insert)을 담당한다.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";
const BLOGGER_API_BASE = "https://www.googleapis.com/blogger/v3";

function getOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars are not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export const bloggerProvider = {
  key: "blogger",

  // Google 로그인 화면으로 보낼 URL 생성. state에는 blogId + nonce를 담아 콜백에서 검증한다.
  buildAuthUrl(state) {
    const { clientId, redirectUri } = getOAuthEnv();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: BLOGGER_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  },

  // authorization code를 access_token/refresh_token으로 교환한다.
  async exchangeAuthCode(code) {
    const { clientId, clientSecret, redirectUri } = getOAuthEnv();

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.error || "Failed to exchange authorization code");
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresIn: data.expires_in,
      scope: data.scope || BLOGGER_SCOPE,
    };
  },

  // access_token으로 이 계정이 소유한 첫 번째 Blogger 블로그 ID를 반환한다.
  async fetchFirstBlogId(accessToken) {
    const res = await fetch(`${BLOGGER_API_BASE}/users/self/blogs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Blogger fetchFirstBlogId] HTTP status:", res.status);
      console.error("[Blogger fetchFirstBlogId] Google API response:", JSON.stringify(errData, null, 2));
      if (res.status === 401) {
        const err = new Error("Unauthorized when fetching blogs list");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(errData.error?.message || `Blogger API error ${res.status}`);
    }
    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) {
      throw new Error("이 Google 계정에 연결된 Blogger 블로그가 없습니다");
    }
    return items[0].id;
  },

  // refresh_token으로 access_token을 재발급한다.
  async refreshAccessToken(refreshToken) {
    const { clientId, clientSecret } = getOAuthEnv();
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error_description || data.error || "Token refresh failed");
      if (data.error === "invalid_grant") err.code = "REFRESH_INVALID";
      throw err;
    }
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  },

  // Blogger API posts.insert로 실제 글을 발행한다.
  // content: { bloggerBlogId, title, html, labels }
  // auth: { accessToken, refreshToken }
  async publish(job, content, auth) {
    const { bloggerBlogId, title, html, labels } = content;
    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, content: html, labels: labels || [] }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Blogger publish] HTTP status:", res.status);
      console.error("[Blogger publish] Google API response:", JSON.stringify(errData, null, 2));
      console.error("[Blogger publish] error.code:", errData.error?.code);
      console.error("[Blogger publish] error.message:", errData.error?.message);
      console.error("[Blogger publish] error.errors:", JSON.stringify(errData.error?.errors));
      if (res.status === 401) {
        const err = new Error(errData.error?.message || "Unauthorized: token may be expired");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      const err = new Error(errData.error?.message || `Blogger API error ${res.status}`);
      err.httpStatus = res.status;
      err.googleErrorCode = errData.error?.code;
      err.googleErrors = errData.error?.errors;
      throw err;
    }
    const post = await res.json();
    return {
      publishedUrl: post.url || "",
      externalId: post.id || "",
    };
  },

  // access_token 유효성 검증. 만료 시 TOKEN_EXPIRED 에러를 던진다.
  async validateAuth(auth) {
    const res = await fetch(`${BLOGGER_API_BASE}/users/self/blogs`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (res.status === 401) {
      const err = new Error("Access token expired or invalid");
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    return res.ok;
  },
};
