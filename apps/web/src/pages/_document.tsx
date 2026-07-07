import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    const version = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
    const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT || 'unknown';

    return (
      <Html lang='en'>
        <Head>
          <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />
          <meta name='theme-color' content='#ffffff' />
          <meta name='mobile-web-app-capable' content='yes' />
          <meta name='apple-mobile-web-app-capable' content='yes' />
          <meta name='apple-mobile-web-app-status-bar-style' content='default' />
          <meta name='apple-mobile-web-app-title' content='Agam Space' />

          {/* Build metadata for integrity verification */}
          <meta name='agam-version' content={version} />
          <meta name='agam-commit' content={commit} />

          {/* Favicons */}
          <link rel='icon' href='/favicon.ico' />
          <link rel='icon' type='image/svg+xml' href='/favicon.svg' />
          <link rel='icon' type='image/png' sizes='32x32' href='/favicon-32x32.png' />
          <link rel='icon' type='image/png' sizes='16x16' href='/favicon-16x16.png' />
          <link rel='icon' type='image/png' sizes='96x96' href='/favicon-96x96.png' />
          <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />
          <link rel='manifest' href='/site.webmanifest' />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
