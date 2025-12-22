import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

type MarkdownProps = {
  content: string
  className?: string
}

export const Markdown = ({ content, className }: MarkdownProps) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children, ...props }) => (
            <pre className="markdown-pre" {...props}>
              {children}
            </pre>
          ),
          code: ({ className: codeClassName, children, ...props }) => (
            <code
              className={codeClassName ? `markdown-code ${codeClassName}` : 'markdown-code'}
              {...props}
            >
              {children}
            </code>
          ),
          a: ({ children, ...props }) => (
            <a className="markdown-link" {...props}>
              {children}
            </a>
          ),
          ul: ({ children, ...props }) => (
            <ul className="markdown-list" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="markdown-list" {...props}>
              {children}
            </ol>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="markdown-heading" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="markdown-heading" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="markdown-heading" {...props}>
              {children}
            </h3>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="markdown-quote" {...props}>
              {children}
            </blockquote>
          ),
          p: ({ children, ...props }) => (
            <p className="markdown-paragraph" {...props}>
              {children}
            </p>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
