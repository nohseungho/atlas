// Blogger Provider - 설계 단계 뼈대. 실제 OAuth/Blogger API 호출은 아직 구현하지 않는다.
// TODO: Google OAuth 연동 후 실제 posts.insert 호출 구현

export const bloggerProvider = {
  key: "blogger",

  // TODO: auth로 access token 갱신 후 Blogger API posts.insert 호출
  async publish() {
    throw new Error("bloggerProvider.publish is not implemented yet (design stage only)");
  },

  // TODO: refresh token으로 access token 발급 시도해 유효성 확인
  async validateAuth() {
    throw new Error("bloggerProvider.validateAuth is not implemented yet (design stage only)");
  },
};
