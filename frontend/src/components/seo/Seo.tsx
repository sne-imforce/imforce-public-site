import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE_URL = 'https://www.imforce.co.za'
const DEFAULT_IMAGE = '/imforce-favicon.png'
const DEFAULT_KEYWORDS = [
  'IMFORCE Talent Recruitment',
  'recruitment agency South Africa',
  'permanent staffing',
  'placement services',
  'job opportunities South Africa',
  'employer hiring solutions',
  'Pietermaritzburg recruitment',
]

type SeoSchema = Record<string, unknown> | Record<string, unknown>[]

type SeoProps = {
  title?: string
  description?: string
  path?: string
  keywords?: readonly string[]
  image?: string
  type?: string
  schema?: SeoSchema
  noIndex?: boolean
}

function upsertMetaTag(
  selector: string,
  attributes: Record<string, string>,
  contentValue?: string,
) {
  const tag = document.head.querySelector(selector) as HTMLMetaElement | null

  if (tag) {
    Object.entries(attributes).forEach(([key, value]) => {
      tag.setAttribute(key, value)
    })
    if (contentValue !== undefined) {
      tag.setAttribute('content', contentValue)
    }
    return tag
  }

  const nextTag = document.createElement('meta')
  Object.entries(attributes).forEach(([key, value]) => {
    nextTag.setAttribute(key, value)
  })
  if (contentValue !== undefined) {
    nextTag.setAttribute('content', contentValue)
  }
  document.head.appendChild(nextTag)
  return nextTag
}

function upsertCanonicalLink(url: string) {
  let link = document.head.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null

  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }

  link.href = url
}

function upsertJsonLd(schema: SeoSchema) {
  let script = document.head.querySelector(
    'script[data-imforce-schema="true"]',
  ) as HTMLScriptElement | null

  if (!script) {
    script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute('data-imforce-schema', 'true')
    document.head.appendChild(script)
  }

  script.textContent = JSON.stringify(schema)
}

export default function Seo({
  title,
  description,
  path,
  keywords = DEFAULT_KEYWORDS,
  image = DEFAULT_IMAGE,
  type = 'website',
  schema,
  noIndex = false,
}: SeoProps) {
  const location = useLocation()

  useEffect(() => {
    const currentPath = path ?? location.pathname
    const canonicalUrl = new URL(currentPath, SITE_URL).toString()
    const pageTitle = title
      ? `${title} | IMFORCE Talent Recruitment`
      : 'IMFORCE Talent Recruitment | Permanent Staffing & Placement'
    const pageDescription =
      description ??
      'IMFORCE Talent Recruitment helps employers and job seekers across South Africa connect through permanent staffing, workforce solutions, and recruitment placement services.'
    const resolvedImage = image.startsWith('http')
      ? image
      : new URL(image, SITE_URL).toString()

    document.title = pageTitle

    upsertMetaTag('meta[name="description"]', { name: 'description' }, pageDescription)
    upsertMetaTag('meta[name="robots"]', { name: 'robots' }, noIndex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
    upsertMetaTag('meta[name="author"]', { name: 'author' }, 'IMFORCE Talent Recruitment')
    upsertMetaTag('meta[name="keywords"]', { name: 'keywords' }, keywords.join(', '))
    upsertMetaTag('meta[name="theme-color"]', { name: 'theme-color' }, '#0b1b2b')
    upsertMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, 'IMFORCE Talent Recruitment')
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, pageTitle)
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, pageDescription)
    upsertMetaTag('meta[property="og:type"]', { property: 'og:type' }, type)
    upsertMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl)
    upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, resolvedImage)
    upsertMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image')
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, pageTitle)
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, pageDescription)
    upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, resolvedImage)
    upsertMetaTag('meta[property="og:image:alt"]', { property: 'og:image:alt' }, pageTitle)
    upsertMetaTag('meta[property="og:locale"]', { property: 'og:locale' }, 'en_ZA')
    upsertCanonicalLink(canonicalUrl)

    const baseSchema = schema ?? {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'IMFORCE Talent Recruitment',
      url: SITE_URL,
      logo: new URL(DEFAULT_IMAGE, SITE_URL).toString(),
      sameAs: [
        'https://www.imforce.co.za',
        'https://www.facebook.com/profile.php?id=61590659210099',
        'https://www.tiktok.com/@imforcetalent?lang=en',
        'https://www.instagram.com/imforce_talent/?hl=en',
        'https://www.linkedin.com/company/imforce-talent-recruitment/',
        'mailto:info@imforce.co.za',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: 'info@imforce.co.za',
        areaServed: 'ZA',
      },
    }

    upsertJsonLd(baseSchema)
  }, [description, image, keywords, location.pathname, noIndex, path, schema, title, type])

  return null
}
