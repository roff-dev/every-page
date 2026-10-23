import { normalise } from '../engine/alphabet';

/** Lines from public-domain works. A random visit finds one of them on its shelf. */
const LINES: { text: string; from: string }[] = [
  { text: 'To be, or not to be, that is the question.', from: 'Hamlet, William Shakespeare' },
  { text: 'Brevity is the soul of wit.', from: 'Hamlet, William Shakespeare' },
  { text: 'The lady doth protest too much, methinks.', from: 'Hamlet, William Shakespeare' },
  { text: 'The rest is silence.', from: 'Hamlet, William Shakespeare' },
  { text: "All the world's a stage, and all the men and women merely players.", from: 'As You Like It, William Shakespeare' },
  { text: 'The course of true love never did run smooth.', from: "A Midsummer Night's Dream, William Shakespeare" },
  { text: 'Now is the winter of our discontent.', from: 'Richard III, William Shakespeare' },
  { text: 'We are such stuff as dreams are made on.', from: 'The Tempest, William Shakespeare' },
  { text: "What's in a name? That which we call a rose by any other name would smell as sweet.", from: 'Romeo and Juliet, William Shakespeare' },
  { text: 'Parting is such sweet sorrow.', from: 'Romeo and Juliet, William Shakespeare' },
  { text: 'If music be the food of love, play on.', from: 'Twelfth Night, William Shakespeare' },
  { text: 'Some are born great, some achieve greatness, and some have greatness thrust upon them.', from: 'Twelfth Night, William Shakespeare' },
  { text: 'Friends, Romans, countrymen, lend me your ears.', from: 'Julius Caesar, William Shakespeare' },
  { text: 'Double, double toil and trouble; fire burn and cauldron bubble.', from: 'Macbeth, William Shakespeare' },
  { text: 'All that glisters is not gold.', from: 'The Merchant of Venice, William Shakespeare' },
  { text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', from: 'Pride and Prejudice, Jane Austen' },
  { text: 'It was the best of times, it was the worst of times.', from: 'A Tale of Two Cities, Charles Dickens' },
  { text: 'It is a far, far better thing that I do, than I have ever done.', from: 'A Tale of Two Cities, Charles Dickens' },
  { text: 'Please, sir, I want some more.', from: 'Oliver Twist, Charles Dickens' },
  { text: 'God bless us, every one.', from: 'A Christmas Carol, Charles Dickens' },
  { text: 'Call me Ishmael.', from: 'Moby-Dick, Herman Melville' },
  { text: 'Curiouser and curiouser.', from: "Alice's Adventures in Wonderland, Lewis Carroll" },
  { text: "We're all mad here.", from: "Alice's Adventures in Wonderland, Lewis Carroll" },
  { text: 'Begin at the beginning, and go on till you come to the end: then stop.', from: "Alice's Adventures in Wonderland, Lewis Carroll" },
  { text: "Why, sometimes I've believed as many as six impossible things before breakfast.", from: 'Through the Looking-Glass, Lewis Carroll' },
  { text: "'Twas brillig, and the slithy toves did gyre and gimble in the wabe.", from: 'Jabberwocky, Lewis Carroll' },
  { text: 'Happy families are all alike; every unhappy family is unhappy in its own way.', from: 'Anna Karenina, Leo Tolstoy, translated by Constance Garnett' },
  { text: 'Reader, I married him.', from: 'Jane Eyre, Charlotte Brontë' },
  { text: 'I can resist everything except temptation.', from: "Lady Windermere's Fan, Oscar Wilde" },
  { text: 'We are all in the gutter, but some of us are looking at the stars.', from: "Lady Windermere's Fan, Oscar Wilde" },
  { text: 'The truth is rarely pure and never simple.', from: 'The Importance of Being Earnest, Oscar Wilde' },
  { text: 'A thing of beauty is a joy for ever.', from: 'Endymion, John Keats' },
  { text: 'Beauty is truth, truth beauty.', from: 'Ode on a Grecian Urn, John Keats' },
  { text: 'To see a world in a grain of sand, and a heaven in a wild flower.', from: 'Auguries of Innocence, William Blake' },
  { text: 'Tyger Tyger, burning bright, in the forests of the night.', from: 'The Tyger, William Blake' },
  { text: 'I wandered lonely as a cloud.', from: 'William Wordsworth' },
  { text: 'Look on my works, ye mighty, and despair.', from: 'Ozymandias, Percy Bysshe Shelley' },
  { text: 'Water, water, every where, nor any drop to drink.', from: 'The Rime of the Ancient Mariner, Samuel Taylor Coleridge' },
  { text: 'No man is an island, entire of itself.', from: 'Devotions upon Emergent Occasions, John Donne' },
  { text: 'Hope is the thing with feathers.', from: 'Emily Dickinson' },
  { text: 'Because I could not stop for Death, he kindly stopped for me.', from: 'Emily Dickinson' },
  { text: 'I am large, I contain multitudes.', from: 'Song of Myself, Walt Whitman' },
  { text: 'Two roads diverged in a yellow wood.', from: 'The Road Not Taken, Robert Frost' },
  { text: 'Quoth the Raven, Nevermore.', from: 'The Raven, Edgar Allan Poe' },
  { text: "'Tis better to have loved and lost than never to have loved at all.", from: 'In Memoriam, Alfred Tennyson' },
  { text: 'Better to reign in Hell, than serve in Heaven.', from: 'Paradise Lost, John Milton' },
  { text: 'They also serve who only stand and wait.', from: 'On His Blindness, John Milton' },
  { text: 'To err is human, to forgive divine.', from: 'An Essay on Criticism, Alexander Pope' },
  { text: 'Was this the face that launched a thousand ships?', from: 'Doctor Faustus, Christopher Marlowe' },
  { text: 'She walks in beauty, like the night.', from: 'Lord Byron' },
  { text: 'I am the master of my fate, I am the captain of my soul.', from: 'Invictus, William Ernest Henley' },
  { text: 'You see, but you do not observe.', from: 'A Scandal in Bohemia, Arthur Conan Doyle' },
  { text: 'I went to the woods because I wished to live deliberately.', from: 'Walden, Henry David Thoreau' },
  { text: 'So we beat on, boats against the current, borne back ceaselessly into the past.', from: 'The Great Gatsby, F. Scott Fitzgerald' },
  { text: 'Mrs. Dalloway said she would buy the flowers herself.', from: 'Mrs Dalloway, Virginia Woolf' },
  { text: 'In the beginning was the Word.', from: 'The Gospel of John, King James Version' },
  { text: 'Let there be light.', from: 'Genesis, King James Version' },
  { text: 'Four score and seven years ago.', from: 'The Gettysburg Address, Abraham Lincoln' },
  { text: 'I think, therefore I am.', from: 'René Descartes' },
  { text: 'Knowledge is power.', from: 'Francis Bacon' },
  { text: 'Once upon a time.', from: 'A great many stories' },
  { text: 'A journey of a thousand miles begins with a single step.', from: 'A saying' },
];

const BY_TEXT = new Map(LINES.map((line) => [normalise(line.text).text, line]));
const TEXTS = [...BY_TEXT.keys()];

/** A line the library knows, as it reads it, picked at random. */
export function randomLine(): string {
  return TEXTS[crypto.getRandomValues(new Uint32Array(1))[0]! % TEXTS.length]!;
}

/** Where a line comes from, if it's one of these. */
export function creditFor(text: string): string | null {
  return BY_TEXT.get(text)?.from ?? null;
}
