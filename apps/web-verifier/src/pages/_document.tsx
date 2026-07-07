import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  const isProduction = process.env.NODE_ENV === 'production';

  return (
    <Html lang='en'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.ico' />
        <meta
          name='description'
          content='Verify Agam Space web assets integrity - cryptographic verification of frontend code'
        />
        {isProduction && (
          <script
            defer
            src='https://tmp.agamspace.app/fetch.js'
            data-website-id='5d8332dc-ffc6-400f-9076-9cc5346bc7b1'
          />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const savedTheme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
