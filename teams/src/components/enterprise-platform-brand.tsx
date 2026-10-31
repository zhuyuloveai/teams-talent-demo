import images from '../assets/enterprise-brands/images.json';

export const enterpriseBrands = {
  repository: { name: 'GitHub', image: images.githubBlack },
  requirements: { name: 'Jira', image: images.jira },
  defects: { name: 'ZenTao', image: images.zentao },
  'design-library': { name: 'Confluence', image: images.confluence },
  'test-assets': { name: 'TestRail', image: images.testrail },
} as const;

export function EnterprisePlatformBrand({ id }: { id: keyof typeof enterpriseBrands }) {
  const brand = enterpriseBrands[id];
  return <span className="resource-icon enterprise-brand-icon">
    {id === 'repository' ? <><img className="enterprise-brand-light" src={images.githubBlack} alt="GitHub" title="GitHub" width={32} height={32} /><img className="enterprise-brand-dark" src={images.githubWhite} alt="GitHub" title="GitHub" width={32} height={32} /></> : <img src={brand.image} alt={brand.name} title={brand.name} width={32} height={32} />}
  </span>;
}
