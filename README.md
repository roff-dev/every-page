# Every Page

![Looking down a lamplit shaft of hexagonal library floors, with the title Every Page](public/og.png)

A lamplit, walkable version of Borges's Library of Babel. Every possible page of 3,200 characters is on a shelf somewhere in it, at exactly one place. Type anything, and you fly down the air shaft, follow a trail of light along the gallery to one book, and it opens to the page where your words have always been. You can also ask it for a famous line, which it finds on one of the countless shelves where that line is written, wander the galleries, and share a link to any page or place.

## Why I built this

Borges's story is a piece of maths in disguise: a finite library that holds everything that could be written. I wanted a version you could stand inside rather than just search, warm and calm instead of grey and endless, and I wanted the engineering underneath to be honest. Nothing is stored. Every page is computed on your device when you open it.

## How it works

Each page is a 3,200-digit number in base 29. A six-round Feistel network, run over those digits, shuffles every place in the library into its page and can be run backwards, so searching is just running it in reverse: your words, padded with random characters, become a page, and unshuffling that page gives its shelf. All of it is BigInt arithmetic in a Web Worker. The site's [How it works](https://every-page.pages.dev/how-it-works/) page explains it with figures you can play with.

The library itself is three.js: merged, vertex-coloured geometry, a custom shader that dresses every shelf from its room coordinates (so moving through endless rooms costs nothing), a floating origin for distances far beyond what floats can hold, and quality tiers that step down on slower phones.

## Running it locally

You'll need Node 22.23 or later.

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # type-checks, then builds to dist/
npm run preview   # serves the build
```

## Built with

- [Astro](https://astro.build) (static output) and TypeScript
- [three.js](https://threejs.org) with hand-written GLSL
- Web Workers, BigInt, Web Audio
- Hosted on Cloudflare Pages

## Credits and licences

- The library is Jorge Luis Borges's, from "La biblioteca de Babel" (1941). The quote on the How it works page is from James E. Irby's translation.
- The famous lines all come from public-domain works, credited in the reader where they're found.
- [libraryofbabel.info](https://libraryofbabel.info) by Jonathan Basile, the searchable library this one owes its idea of search to.
- Typefaces, all under the SIL Open Font License 1.1, self-hosted through [Fontsource](https://fontsource.org): Fraunces (Undercase Type), Newsreader (Production Type) and Courier Prime (Alan Dague-Greene).
- Sounds: footsteps from Kenney's "Impact Sounds" and book sounds from Kenney's "RPG Audio", both CC0 ([kenney.nl](https://kenney.nl)). The room tone and the chime are synthesised in the browser.
- [three.js](https://github.com/mrdoob/three.js) and [Astro](https://github.com/withastro/astro) are MIT licensed.

My code is under the [MIT licence](LICENSE).
