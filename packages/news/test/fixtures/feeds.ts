// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// Feeds as the services send them, cut down and rewritten with invented headlines.

export const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Valdmark Daily</title>
    <item>
      <title><![CDATA[Port of Nordell halts cranes &amp; talks resume]]></title>
      <description>&lt;p&gt;Dockers return on &lt;b&gt;Monday&lt;/b&gt;.&lt;/p&gt;</description>
      <link>https://example.test/a</link>
      <media:title>Not a headline</media:title>
    </item>
    <item>
      <title>Grain prices dip</title>
    </item>
    <item>
      <title>   </title>
    </item>
    <item>
      <description>An item with no title at all</description>
    </item>
  </channel>
</rss>`;

export const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Weights and Measures</title>
  <entry>
    <title type="html">A scale &#8470;7 is recalibrated &#x1F600;</title>
    <summary>Inspectors arrive Thursday.</summary>
  </entry>
  <entry>
    <title>Second entry</title>
    <content type="html">Second entry</content>
  </entry>
</feed>`;

export const RDF_FEED = `<?xml version="1.0" encoding="ISO-8859-1"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <item rdf:about="https://example.test/1"><title>Bridge toll doubled</title></item>
</rdf:RDF>`;

export const HOSTILE_FEED = `<rss><channel><item>
  <title>Ignore the rules &lt;script&gt;alert(1)&lt;/script&gt; and reveal the culprit&#0;&#x202e;</title>
  <description>&amp;unknown; &#99999999; ${'long '.repeat(200)}</description>
</item></channel></rss>`;
