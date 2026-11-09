// Third-party assets used by the game. `npm run assets` downloads them into
// assets-src/ (not in git) and writes the processed files to public/assets/.

export const SOURCES = {
  polyhaven: { title: 'Poly Haven', author: 'Poly Haven and its artists', url: 'https://polyhaven.com', license: 'CC0-1.0' },
  vsco2ce: { title: 'VSCO 2 Community Edition', author: 'Versilian Studios', url: 'https://github.com/sgossner/VSCO-2-CE', license: 'CC0-1.0' },
  vcsl: { title: 'Versilian Community Sample Library', author: 'Versilian Studios and contributors', url: 'https://github.com/sgossner/VCSL', license: 'CC0-1.0' },
  original: { title: 'Original models', author: '幽燈魔境 project (modelled in Blender)', url: 'scripts/blender', license: 'original' },
  kenney: { title: 'Kenney audio packs', author: 'Kenney (www.kenney.nl)', url: 'https://kenney.nl/assets/category:Audio', license: 'CC0-1.0' },
  cinzel: { title: 'Cinzel', author: 'The Cinzel Project Authors', url: 'https://github.com/NDISCOVER/Cinzel', license: 'OFL-1.1', licenseFile: 'Cinzel-OFL.txt' },
  notoseriftc: { title: 'Noto Serif TC', author: 'Google Inc.', url: 'https://github.com/notofonts/noto-cjk', license: 'OFL-1.1', licenseFile: 'NotoSerifTC-OFL.txt' },
};

/** Fonts are subset by scripts/subset_fonts.py; listed here for the credits. */
export const FONTS = {
  cinzel: { source: 'cinzel', file: 'fonts/cinzel.woff2' },
  'noto-serif-tc': { source: 'notoseriftc', file: 'fonts/noto-serif-tc.woff2' },
};

/** Poly Haven PBR sets (1k): base colour, OpenGL normal, AO/roughness/metal. */
export const TEXTURES = [
  // grotto
  'dark_rock', 'rock_wall_02', 'rocky_trail', 'mud_forest', 'mossy_rock',
  // fields and roads
  'sparse_grass', 'forest_ground_04', 'forest_leaves_03', 'muddy_tracks', 'mossy_cobblestone', 'rocky_terrain_02',
  // village and props
  'japanese_cedar_planks', 'dark_wooden_planks', 'thatch_roof_angled', 'grey_roof_tiles', 'worn_mossy_plasterwall',
  'japanese_stone_wall', 'bamboo_wall', 'japanese_cedar_bark', 'japanese_zelkova_bark',
];

/** Poly Haven models and their triangle budgets (0 = keep the geometry). */
export const MODELS = {
  antique_katana_01: 3000,
  katana_stand_01: 1500,
  wooden_lantern_01: 2500,
  treasure_chest: 5000,
  barrel_03: 1500,
  wooden_bucket_01: 1200,
  wooden_crate_01: 1200,
  wicker_basket_01: 1500,
  ceramic_vase_01: 1200,
  stone_fire_pit: 2500,
  rock_07: 1500,
  rock_09: 1500,
  moon_rock_01: 1500,
  rock_moss_set_01: 4000,
  dead_tree_trunk: 5000,
  tree_stump_01: 2500,
  root_cluster_01: 6000,
  fern_02: 0,
};

/** Models built by scripts/blender/props.py (raw exports in scripts/blender/export/). */
export const ORIGINAL_MODELS = ['sotoba', 'jizo', 'torii_fallen', 'fence_broken', 'katana_stuck', 'spear_stuck', 'arrows_stuck', 'banner_torn', 'timber_support'];

export const HDRIS = ['moonlit_golf'];

/**
 * Pitched instruments. `pick` selects the velocity layers / round robins kept.
 * Octave numbering differs between libraries, so notes are checked by pitch detection;
 * `octave` overrides it for inharmonic sounds (bells), where detection is unreliable.
 */
export const INSTRUMENTS = {
  vln_sus: { repo: 'vsco2ce', dir: 'Strings/Violin Section/susVib', pick: /_v[12]\.wav$/, max: 4.5 },
  vla_sus: { repo: 'vsco2ce', dir: 'Strings/Viola Section/susvib', pick: /_v2_1\.wav$/, max: 4.5 },
  vc_sus: { repo: 'vsco2ce', dir: 'Strings/Cello Section/susvib', pick: /_v[13]_1\.wav$/, max: 4.5 },
  cb_sus: { repo: 'vsco2ce', dir: 'Strings/Solo Contrabass/SusVib', pick: /_v3_rr1\.wav$/, max: 4.5 },
  vln_trem: { repo: 'vsco2ce', dir: 'Strings/Violin Section/Trem', pick: /_v2\.wav$/, max: 4 },
  vc_trem: { repo: 'vsco2ce', dir: 'Strings/Cello Section/trem', pick: /_v2_1\.wav$/, max: 4 },
  vln_spic: { repo: 'vsco2ce', dir: 'Strings/Violin Section/Spic', pick: /_v2_rr[12]\.wav$/, max: 1.5 },
  vc_spic: { repo: 'vsco2ce', dir: 'Strings/Cello Section/spic', pick: /_v2_RR[12]\.wav$/, max: 1.5 },
  vln_pizz: { repo: 'vsco2ce', dir: 'Strings/Violin Section/Pizz', pick: /_v2_rr1\.wav$/, max: 2 },
  vc_pizz: { repo: 'vsco2ce', dir: 'Strings/Cello Section/pizzT', pick: /_v2_RR1\.wav$/, max: 2.5 },
  hn_sus: { repo: 'vsco2ce', dir: 'Brass/F Horn/sus', pick: /_v[13]_1\.wav$/, max: 4.5 },
  hn_stac: { repo: 'vsco2ce', dir: 'Brass/F Horn/stac', pick: /_v[23]_rr1\.wav$/, max: 1.5 },
  tbn_sus: { repo: 'vsco2ce', dir: 'Brass/Tenor Trombone/sus', pick: /_v3_1\.wav$/, max: 4.5 },
  tuba_sus: { repo: 'vsco2ce', dir: 'Brass/Tuba/sus', pick: /_v3_rr1_Mid\.wav$/, max: 4.5 },
  fl_sus: { repo: 'vsco2ce', dir: 'Woodwinds/Flute/susNV', pick: /_v1_1\.wav$/, max: 4.5 },
  harp: { repo: 'vsco2ce', dir: 'Strings/Harp', pick: /\.wav$/, max: 3.5 },
  koto: { repo: 'vcsl', dir: 'Chordophones/Zithers/Dan Tranh/Normal', pick: /\/(?:[A-G]#?\d_f|b2_mf)_1\.wav$/, max: 3.5 },
  chimes: { repo: 'vcsl', dir: 'Idiophones/Struck Idiophones/Tubular Bells 1', pick: /_(f|ff|fff)_rr\d\.wav$/, max: 5, octave: 1 },
  glass: { repo: 'vcsl', dir: 'Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow', pick: /_Main\.wav$/, max: 6 },
  psaltery: { repo: 'vcsl', dir: 'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow', pick: /\.wav$/, max: 4.5 },
};

/** Unpitched one-shots used by the music (drums, metals). */
export const PERCUSSION = {
  taiko_ff: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_ff_1.wav'],
  taiko_f: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_f_1.wav'],
  taiko_mf: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_mf_1.wav'],
  taiko_pp: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_pp_1.wav'],
  taiko_stick: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/sticks/EthnicLargeSticks_hit_f_1.wav'],
  taiko_stick_soft: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/sticks/EthnicLargeSticks_hit_mp_1.wav'],
  taiko_rim: ['vsco2ce', 'VSCO 1 Percussion/drums/other/ethnic/giant/EthnicLargeStick_rimshot_1.wav'],
  bdrum_ff: ['vcsl', 'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v7_rr1_Sum.wav'],
  bdrum_mf: ['vcsl', 'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v3_rr1_Sum.wav'],
  frame_lo: ['vcsl', 'Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav'],
  frame_hi: ['vcsl', 'Membranophones/Struck Membranophones/Frame Drum/HDrumS_Hit_v3_rr1_Sum.wav'],
  timp1: ['vsco2ce', 'Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav'],
  timp2: ['vsco2ce', 'Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav'],
  timp3: ['vsco2ce', 'Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum.wav'],
  timp4: ['vsco2ce', 'Percussion/Timpani/Timpani4_Hit_v3_rr1_Sum.wav'],
  timp5: ['vsco2ce', 'Percussion/Timpani/Timpani5_Hit_v3_rr1_Sum.wav'],
  timp_roll_lo: ['vsco2ce', 'Percussion/Timpani/Rolls/Timpani1_Roll_v5_rr1_Sum.wav'],
  timp_roll_hi: ['vsco2ce', 'Percussion/Timpani/Rolls/Timpani4_Roll_v5_rr1_Sum.wav'],
  gong_ff: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Gong/gong_hit_ff.wav'],
  gong_mp: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Gong/gong_hit_mp.wav'],
  gong_roll: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Gong/gong_roll_medium_f.wav'],
  gong_scrape: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Gong/gong_scrape_1.wav'],
  cym_swell: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_roll2_cresc.wav'],
  cym_soft: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_f.wav'],
  cym_scrape: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Cymbals/susp/susp_FX_scrape_1.wav'],
  crash: ['vsco2ce', 'VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_ff_loose.wav'],
  woodblock: ['vcsl', 'Idiophones/Struck Idiophones/Woodblock/wood_click_f_rr1.wav'],
  clapper: ['vcsl', 'Idiophones/Struck Idiophones/Claves/Claves1_Hit_v3_rr1_Mid.wav'],
  rin: ['vcsl', 'Idiophones/Struck Idiophones/Finger Cymbals/Fing_Cymb.wav'],
  bowl: ['vcsl', 'Idiophones/Struck Idiophones/Hand Bells, Nepalese/HB_1.wav'],
  log_lo: ['vcsl', 'Idiophones/Struck Idiophones/Slit Drum/LogDrumLo_MedM_v2_rr1_Sum.wav'],
  log_hi: ['vcsl', 'Idiophones/Struck Idiophones/Slit Drum/LogDrumHi_MedM_v2_rr1_Sum.wav'],
};

/** Kenney packs (zip) and the sound effects taken from them: name -> path inside the pack. */
export const KENNEY_PACKS = ['impact-sounds', 'rpg-audio', 'interface-sounds'];
const I = (f) => ['impact-sounds', `Audio/${f}.ogg`];
const R = (f) => ['rpg-audio', `Audio/${f}.ogg`];
const U = (f) => ['interface-sounds', `Audio/${f}.ogg`];
/** Names ending in _1, _2 ... are variants picked at random. */
export const SFX = {
  // interface
  cursor: U('tick_001'), confirm: U('confirmation_002'), cancel: U('back_002'), pause: U('open_001'),
  locked: U('error_004'), text: U('click_001'), soul: U('glass_001'),
  // combat
  slice_1: R('knifeSlice'), slice_2: R('knifeSlice2'),
  hit_1: I('impactPunch_medium_000'), hit_2: I('impactPunch_medium_001'), hit_3: I('impactPunch_medium_002'),
  hit_heavy: I('impactPunch_heavy_000'),
  guard_1: I('impactMetal_medium_000'), guard_2: I('impactMetal_medium_001'), parry: I('impactMetal_light_000'),
  bone_1: I('impactWood_light_000'), bone_2: I('impactWood_light_001'),
  armor_1: I('impactPlate_medium_000'), armor_2: I('impactPlate_medium_001'),
  dodge_1: R('cloth1'), dodge_2: R('cloth3'), draw: R('drawKnife1'), sheathe: R('drawKnife3'),
  // world
  step_stone_1: I('footstep_concrete_000'), step_stone_2: I('footstep_concrete_001'), step_stone_3: I('footstep_concrete_002'),
  step_grass_1: I('footstep_grass_000'), step_grass_2: I('footstep_grass_001'), step_grass_3: I('footstep_grass_002'),
  step_wood_1: I('footstep_wood_000'), step_wood_2: I('footstep_wood_001'), step_wood_3: I('footstep_wood_002'),
  step_dirt_1: R('footstep00'), step_dirt_2: R('footstep01'), step_dirt_3: R('footstep02'),
  door_open: R('doorOpen_1'), door_close: R('doorClose_2'), creak: R('creak1'), lever: R('metalLatch'), unlock: R('metalClick'),
  coin: R('handleCoins'), pickup: R('handleSmallLeather'), drop: R('dropLeather'), page: R('bookFlip2'),
  break_wood: I('impactPlank_medium_000'), break_heavy: I('impactWood_heavy_000'), stone: I('impactMining_000'),
  shatter: I('impactGlass_heavy_000'), trap: I('impactMetal_heavy_002'), bell: I('impactBell_heavy_002'),
};
