/**
 * 曲の定義。譜面は 1小節＝16分音符16マスの文字列で、押している区間を表す。
 *   X＝押し始め  -＝押したまま  .＝離す
 * 区間ごとに候補パターンを持たせ、譜面生成（chart.ts）が軌道を見ながら選ぶ。
 */
export type SectionKind = 'intro' | 'a' | 'b' | 'sabi' | 'outro';
export type DrumStyle = 'sparse' | 'beat' | 'drive';

export interface SectionDef {
  kind: SectionKind;
  bars: number;
  /** 1小節ごとのコード（足りなければ繰り返す） */
  chords: string[];
  patterns: string[];
  drums: DrumStyle;
}

export interface SongDef {
  id: string;
  title: string;
  level: string;
  bpm: number;
  /** 移調（半音）。コードは C 基準で書く */
  transpose: number;
  seed: number;
  /** 理想の軌道から壁までの距離（曲ごとに一定） */
  halfGap: number;
  /** クリアで解放される機体カラー */
  unlockColor: { name: string; color: string };
  sections: SectionDef[];
}

export const SECTION_LABEL: Record<SectionKind, string> = {
  intro: 'イントロ',
  a: 'Aメロ',
  b: 'Bメロ',
  sabi: 'サビ!',
  outro: 'ラスト',
};

const EASY = {
  intro: ['X---....X---....', 'X-------........'],
  a: ['X---....X---....', 'X-------........', 'X---....X-------', 'X-..X-..X---....'],
  b: ['X-..X-..X---....', 'X---....X-..X-..', 'X-------........'],
  sabi: ['X-..X-..X-..X-..', 'X---....X-..X-..', 'X-..X-..X---....'],
  outro: ['X---....X---....', 'X-------........'],
};

const NORMAL = {
  intro: ['X---....X---....', 'X-..X-..X-..X-..'],
  a: ['X-..X-..X-..X-..', 'X---....X-..X-..', 'X-.X-.X-X---....', 'X-------X-..X-..'],
  b: ['X.X.X-..X.X.X-..', 'X--.X--.X---....', 'X-..X-..X.X.X-..'],
  sabi: ['X.X.X.X.X-..X-..', 'X-.X-.X-.X-.X-..', 'X.X.X-..X.X.X-..', 'X-..X.X.X-..X.X.'],
  outro: ['X---....X---....', 'X-------........'],
};

const HARD = {
  intro: ['X---....X---....', 'X-..X-..X-..X-..'],
  a: ['X.X.X-..X-.X-.X.', 'X-.X-.X-X.X.X-..', 'X--.X.X.X--.X.X.'],
  b: ['X.X.X.X.X.X.X-..', 'X-.X.X-.X-.X.X-.', 'XX..XX..X-..X-..'],
  sabi: ['X.X.X.X.X.X.X.X.', 'X-.X-.X-.X-.X-.X', 'X.XX.XX.X-..X-..', 'X-.X.X-.X.X-.X.X'],
  outro: ['X-..X-..X-..X-..', 'X-------........'],
};

export const SONGS: SongDef[] = [
  {
    id: 'easy', title: 'はじめての風', level: 'かんたん', bpm: 100, transpose: 0, seed: 101, halfGap: 64,
    unlockColor: { name: 'シアン', color: '#3ee8ff' },
    sections: [
      { kind: 'intro', bars: 4, chords: ['C', 'G'], patterns: EASY.intro, drums: 'sparse' },
      { kind: 'a', bars: 8, chords: ['C', 'Am', 'F', 'G'], patterns: EASY.a, drums: 'beat' },
      { kind: 'b', bars: 8, chords: ['F', 'G', 'Em', 'Am'], patterns: EASY.b, drums: 'beat' },
      { kind: 'sabi', bars: 8, chords: ['F', 'G', 'C', 'Am'], patterns: EASY.sabi, drums: 'drive' },
      { kind: 'outro', bars: 4, chords: ['F', 'G', 'C', 'C'], patterns: EASY.outro, drums: 'sparse' },
    ],
  },
  {
    id: 'normal', title: 'ネオンの谷', level: 'ふつう', bpm: 120, transpose: 2, seed: 202, halfGap: 56,
    unlockColor: { name: 'レモン', color: '#ffe23e' },
    sections: [
      { kind: 'intro', bars: 4, chords: ['Am', 'F'], patterns: NORMAL.intro, drums: 'sparse' },
      { kind: 'a', bars: 8, chords: ['Am', 'F', 'C', 'G'], patterns: NORMAL.a, drums: 'beat' },
      { kind: 'b', bars: 8, chords: ['Dm', 'Em', 'F', 'G'], patterns: NORMAL.b, drums: 'beat' },
      { kind: 'sabi', bars: 8, chords: ['F', 'G', 'Em', 'Am'], patterns: NORMAL.sabi, drums: 'drive' },
      { kind: 'a', bars: 4, chords: ['Am', 'F', 'C', 'G'], patterns: NORMAL.a, drums: 'beat' },
      { kind: 'sabi', bars: 8, chords: ['F', 'G', 'Em', 'Am'], patterns: NORMAL.sabi, drums: 'drive' },
      { kind: 'outro', bars: 4, chords: ['F', 'G', 'Am', 'Am'], patterns: NORMAL.outro, drums: 'sparse' },
    ],
  },
  {
    id: 'hard', title: 'スレスレ・ドライブ', level: 'むずかしい', bpm: 140, transpose: 4, seed: 303, halfGap: 48,
    unlockColor: { name: 'マゼンタ', color: '#ff4fd8' },
    sections: [
      { kind: 'intro', bars: 4, chords: ['Am', 'Am', 'F', 'G'], patterns: HARD.intro, drums: 'sparse' },
      { kind: 'a', bars: 8, chords: ['Am', 'Am', 'F', 'G'], patterns: HARD.a, drums: 'beat' },
      { kind: 'b', bars: 8, chords: ['Dm', 'G', 'C', 'E'], patterns: HARD.b, drums: 'beat' },
      { kind: 'sabi', bars: 8, chords: ['F', 'G', 'Am', 'Am'], patterns: HARD.sabi, drums: 'drive' },
      { kind: 'a', bars: 8, chords: ['Am', 'Am', 'F', 'G'], patterns: HARD.a, drums: 'beat' },
      { kind: 'sabi', bars: 8, chords: ['F', 'G', 'Am', 'E'], patterns: HARD.sabi, drums: 'drive' },
      { kind: 'outro', bars: 4, chords: ['F', 'G', 'Am', 'Am'], patterns: HARD.outro, drums: 'sparse' },
    ],
  },
];
