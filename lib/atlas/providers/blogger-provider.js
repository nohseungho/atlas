// Blogger Provider. OAuth 연결(계정 연결 -> Token Store 저장)까지만 구현한다.
// 실제 글 발행(publish)은 아직 구현하지 않는다.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";

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

  // TODO: auth(access/refresh token)로 Blogger API posts.insert 호출
  async publish() {
    throw new Error("bloggerProvider.publish is not implemented yet (design stage only)");
  },

  // TODO: refresh token으로 access token 갱신 시도해 유효성 확인
  async validateAuth() {
    throw new Error("bloggerProvider.validateAuth is not implemented yet (design stage only)");
  },
};
