// Publish Provider 공통 인터페이스 (설계 단계, 실제 구현 없음).
//
// 각 채널(Blogger/WordPress/Medium 등)은 아래 형태를 구현한다:
//
// {
//   key: string,
//   publish: (job, content, auth) => Promise<{ publishedUrl: string, externalId: string }>,
//   validateAuth: (auth) => Promise<boolean>,
// }
//
// auth(토큰 등)는 blog record에 직접 저장하지 않는다. 별도 Token Store(추후 설계)에서
// 조회해 provider에 전달하는 구조로 간다.

export function createProviderRegistry(providers) {
  const registry = new Map(providers.map((provider) => [provider.key, provider]));

  return {
    get(key) {
      return registry.get(key);
    },
  };
}
