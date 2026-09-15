import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMemo } from 'react'

interface Props {
  text: string
  /** e.g. https://raw.githubusercontent.com/owner/repo/main/ */
  rawBase?: string
  /** strip the leading H1 if it just repeats the repo name */
  dropFirstHeading?: boolean
}

/**
 * GitHub READMEs reference images and files relatively. Rewrite those to the
 * repository's raw host so they render instead of 404-ing on the local origin.
 */
function makeTransform(rawBase?: string) {
  return (url: string): string => {
    if (!url) return url
    if (/^(https?:|data:|mailto:|#)/i.test(url)) return url
    if (!rawBase) return url
    const clean = url.replace(/^\.\//, '').replace(/^\//, '')
    return rawBase.replace(/\/$/, '/') + clean
  }
}

export function Markdown({ text, rawBase, dropFirstHeading }: Props): React.JSX.Element {
  const transform = useMemo(() => makeTransform(rawBase), [rawBase])
  const body = useMemo(() => {
    if (!dropFirstHeading) return text
    return text.replace(/^\s*#\s+.*(\r?\n)+/, '')
  }, [text, dropFirstHeading])

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transform}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noreferrer" {...rest}>
              {children}
            </a>
          )
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
