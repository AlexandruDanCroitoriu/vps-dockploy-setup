export type PublishedRegistryImage = {
  digest: string;
  configDigest: string;
};

export function registryHasLocalImage(
  publishedImages: PublishedRegistryImage[],
  image: { identifier: string; digests: string[] },
) {
  return publishedImages.some(
    (published) =>
      published.configDigest === image.identifier ||
      image.digests.includes(published.digest),
  );
}
