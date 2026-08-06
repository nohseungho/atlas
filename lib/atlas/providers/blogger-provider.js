// Blogger Provider. OAuth 연결 및 실제 글 발행(posts.insert)을 담당한다.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";
const BLOGGER_API_BASE = "https://www.googleapis.com/blogger/v3";

// ATLAS의 공식 로컬 포트는 3002로 고정한다. GOOGLE_REDIRECT_URI가 이 값과 다르면
// Google Console에 등록된 콜백과 실제 실행 포트가 어긋나 인증 후 콜백이 실패한다.
const OFFICIAL_REDIRECT_URI = "http://localhost:3002/api/auth/blogger/callback";

function assertOfficialRedirectUri(redirectUri) {
  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error(`ATLAS OAuth 설정 오류: GOOGLE_REDIRECT_URI는 ${OFFICIAL_REDIRECT_URI} 이어야 합니다.`);
  }

  const isOfficial =
    parsed.hostname === "localhost" &&
    parsed.port === "3002" &&
    parsed.pathname === "/api/auth/blogger/callback";

  if (!isOfficial) {
    throw new Error(`ATLAS OAuth 설정 오류: GOOGLE_REDIRECT_URI는 ${OFFICIAL_REDIRECT_URI} 이어야 합니다.`);
  }
}

function getOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars are not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)"
    );
  }

  assertOfficialRedirectUri(redirectUri);

  return { clientId, clientSecret, redirectUri };
}

// posts.list is paginated: maxResults caps a single page and nextPageToken carries
// the rest. Every caller here needs the COMPLETE set — a partial list would make
// the Publisher believe an already-public post is missing and offer to create a
// duplicate — so we always drain nextPageToken. MAX_PAGES only guards a runaway loop.
const MAX_PAGES = 50;
const PAGE_SIZE = 50;

async function listAllPosts(bloggerBlogId, accessToken, { status, fetchBodies = false, view, label }) {
  const items = [];
  let pageToken = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      status,
      fetchBodies: String(Boolean(fetchBodies)),
      fetchImages: "false",
      maxResults: String(PAGE_SIZE),
    });
    if (view) params.set("view", view);
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        const err = new Error(`Unauthorized when listing ${label}`);
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Blogger API error ${res.status}`);
    }

    const data = await res.json();
    for (const p of data.items || []) {
      items.push({
        id: p.id,
        title: p.title || "",
        url: p.url || "",
        status: p.status || status,
        content: p.content || "",
        published: p.published || "",
        updated: p.updated || "",
      });
    }

    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  return items;
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
  // content: { bloggerBlogId, title, html, labels, metaDescription }
  // auth: { accessToken, refreshToken }
  //
  // metaDescription은 Post 리소스의 customMetaData(=Blogger 편집기의 "검색 설명")로
  // 전송된다. 이 필드를 보내지 않아 기존 공개 글 8개에 meta description이 하나도
  // 없었다. 값이 없으면 필드를 아예 넣지 않아 Blogger 기본 동작을 바꾸지 않는다.
  async publish(job, content, auth) {
    const { bloggerBlogId, title, html, labels, metaDescription } = content;
    const payload = { title, content: html, labels: labels || [] };
    const meta = String(metaDescription || "").trim();
    if (meta) payload.customMetaData = meta;

    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

  // 기존 게시글을 postId로 정확히 조회한다. Cloudinary Image Automation Sprint에서
  // "추측으로 새 글을 만들지 않고, 저장된 postId가 실재하는지" 검증하는 데 쓴다.
  async getPost(bloggerBlogId, postId, accessToken) {
    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/${postId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        const err = new Error("Unauthorized when fetching post");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      if (res.status === 404) return null;
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Blogger API error ${res.status}`);
    }
    const post = await res.json();
    return { id: post.id, title: post.title || "", url: post.url || "" };
  },

  // postId가 없을 때의 fallback: 저장된 published URL의 path로 기존 글을 조회한다.
  // (posts.insert로 새 글을 만드는 것과는 무관 — 조회 전용.)
  async getPostByPath(bloggerBlogId, urlPath, accessToken) {
    const res = await fetch(
      `${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/bypath?path=${encodeURIComponent(urlPath)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      if (res.status === 401) {
        const err = new Error("Unauthorized when fetching post by path");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      if (res.status === 404) return null;
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Blogger API error ${res.status}`);
    }
    const post = await res.json();
    return { id: post.id, title: post.title || "", url: post.url || "" };
  },

  // 기존 게시글을 posts.patch로 갱신한다. 요청 바디에 넣지 않은 필드는 Blogger가
  // 기존 값을 그대로 유지하므로, title/publish date는 여전히 절대 건드리지 않는다.
  // content: { html?, labels?, metaDescription? } — 전달된 필드만 갱신된다.
  //
  // labels/metaDescription은 SEO 백필(§9)에서만 쓰인다. 둘 다 생략하면 이 함수는
  // 종전과 완전히 동일하게 본문만 patch한다.
  async updatePost(bloggerBlogId, postId, content, auth) {
    const payload = {};
    if (content?.html !== undefined) payload.content = content.html;
    if (Array.isArray(content?.labels)) payload.labels = content.labels;
    const meta = String(content?.metaDescription || "").trim();
    if (meta) payload.customMetaData = meta;
    if (Object.keys(payload).length === 0) {
      throw new Error("updatePost: 갱신할 필드가 없습니다 (html/labels/metaDescription 중 최소 1개 필요).");
    }

    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/${postId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Blogger updatePost] HTTP status:", res.status);
      console.error("[Blogger updatePost] Google API response:", JSON.stringify(errData, null, 2));
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
    return { publishedUrl: post.url || "", externalId: post.id || "" };
  },

  // 선택된 blog의 DRAFT 게시글 목록을 조회한다 (posts.list, status=DRAFT).
  // 초안은 view=ADMIN이어야 반환된다. 본문/이미지는 목록 단계에서 받지 않는다.
  async listDrafts(bloggerBlogId, accessToken) {
    return listAllPosts(bloggerBlogId, accessToken, {
      status: "DRAFT",
      view: "ADMIN",
      fetchBodies: false,
      label: "drafts",
    });
  },

  // postId로 게시글을 view=ADMIN으로 조회한다. 초안(DRAFT)도 조회 가능하며 status와
  // content를 함께 반환해, 반영 후 "DRAFT 유지 + 이미지 반영"을 검증하는 데 쓴다.
  async getPostAdmin(bloggerBlogId, postId, accessToken) {
    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/${postId}?view=ADMIN`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        const err = new Error("Unauthorized when fetching post (admin)");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      if (res.status === 404) return null;
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Blogger API error ${res.status}`);
    }
    const post = await res.json();
    return { id: post.id, title: post.title || "", url: post.url || "", status: post.status || "", content: post.content || "" };
  },

  // 비공개 초안(DRAFT)으로 새 글을 생성한다 (posts.insert?isDraft=true).
  // isDraft=true를 강제하며, 공개 발행(posts.insert without isDraft / publish)과는
  // 완전히 분리된 경로다. 이 메서드는 절대 공개 상태로 글을 만들지 않는다.
  async insertDraft(bloggerBlogId, content, accessToken) {
    const { title, html, labels } = content;
    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${bloggerBlogId}/posts/?isDraft=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: html, labels: labels || [] }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 401) {
        const err = new Error(errData.error?.message || "Unauthorized: token may be expired");
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      const err = new Error(errData.error?.message || `Blogger API error ${res.status}`);
      err.httpStatus = res.status;
      throw err;
    }
    const post = await res.json();
    return { id: post.id || "", url: post.url || "", status: post.status || "DRAFT" };
  },

  // LIVE(공개) 게시글 전체 목록을 본문 포함으로 조회한다 (pagination 끝까지).
  // ATLAS article을 실제 공개 글에 안전 매칭하고 이미지 개수를 검증하는
  // read-only 동기화에 쓴다. 절대 글을 생성/수정하지 않는다.
  async listLivePosts(bloggerBlogId, accessToken) {
    return listAllPosts(bloggerBlogId, accessToken, {
      status: "LIVE",
      fetchBodies: true,
      label: "live posts",
    });
  },

  // DRAFT-only creation used by the production pipeline. Delegates to insertDraft
  // (isDraft=true) so the pipeline can never accidentally publish a public post.
  async createDraft(bloggerBlogId, content, accessToken) {
    return this.insertDraft(bloggerBlogId, content, accessToken);
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
