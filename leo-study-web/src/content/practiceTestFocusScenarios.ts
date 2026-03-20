import { studyGuideOfficialResearchByLd } from './studyGuideOfficialResearch'
import { strengthenScenarioDistractors } from './practiceTestChoiceTuning'
import { appendTrueFalseFollowUps } from './practiceTestTrueFalse'

type PracticeTestQuestion = {
  id: string
  ldNumber: string
  objective: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
  format?: 'multiple_choice' | 'true_false'
}

type PracticeTestScenario = {
  id: string
  title: string
  stem: string
  ldNumbers: string[]
  questions: PracticeTestQuestion[]
}

type ArrestFocusSeed = {
  id: string
  title: string
  stem: string
  stopBasis: string
  arrestAuthority: string
  searchScope: string
  reportDetail: string
}

type SearchFocusSeed = {
  id: string
  title: string
  stem: string
  category:
    | 'vehicle'
    | 'search-condition'
    | 'consent'
    | 'digital'
    | 'protective-sweep'
    | 'pat-search'
    | 'inventory'
    | 'plain-view'
    | 'exigent'
    | 'warrant'
    | 'abandonment'
    | 'search-incident'
  authority: string
  scope: string
  nextStep: string
  reportDetail: string
}

type ForceFocusSeed = {
  id: string
  title: string
  stem: string
  initialResponse: string
  forceOption: string
  postForceDuty: string
  reportDetail: string
}

type TtsObjectiveRef = {
  ldNumber: string
  chapter: number
  label: string
  text: string
}

type SearchObjectiveProfile = {
  authoritySummary: string
  authorityRefs: TtsObjectiveRef[]
  scopeSummary: string
  scopeRefs: TtsObjectiveRef[]
  nextStepSummary: string
  nextStepRefs: TtsObjectiveRef[]
  challengeSummary: string
  challengeRefs: TtsObjectiveRef[]
}

type FollowUpVariant = {
  objective: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

function question(
  id: string,
  ldNumber: string,
  objective: string,
  prompt: string,
  choices: string[],
  correctIndex: number,
  explanation: string,
): PracticeTestQuestion {
  return { id, ldNumber, objective, prompt, choices, correctIndex, explanation }
}

function scenario(
  id: string,
  title: string,
  stem: string,
  ldNumbers: string[],
  questions: PracticeTestQuestion[],
): PracticeTestScenario {
  return { id, title, stem, ldNumbers, questions }
}

const ttsObjectiveCache = new Map<string, TtsObjectiveRef>()

function getTtsObjective(ldNumber: string, chapter: number, label: string): TtsObjectiveRef {
  const cacheKey = `${ldNumber}-${chapter}-${label}`
  const cached = ttsObjectiveCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const chapterGuide = studyGuideOfficialResearchByLd[ldNumber]?.chapters.find((entry) => entry.chapter === chapter)
  const objective = chapterGuide?.ttsSection?.objectives.find((entry) => entry.label === label)

  if (!chapterGuide || !objective) {
    throw new Error(`Missing TTS objective mapping for LD ${ldNumber} Chapter ${chapter}${label}`)
  }

  const ref = { ldNumber, chapter, label, text: objective.text }
  ttsObjectiveCache.set(cacheKey, ref)
  return ref
}

function formatTtsObjective(summary: string, ...refs: TtsObjectiveRef[]): string {
  const codes = refs.map((ref) => `${ref.ldNumber}.${ref.chapter}${ref.label}`).join(' / ')
  return `TTS ${codes} — ${summary}`
}

const ld15DetentionRefs = [getTtsObjective('15', 3, 'A'), getTtsObjective('15', 3, 'B')]
const ld15ArrestAuthorityRefs = [
  getTtsObjective('15', 4, 'A'),
  getTtsObjective('15', 4, 'B'),
  getTtsObjective('15', 4, 'E'),
  getTtsObjective('15', 4, 'F'),
  getTtsObjective('15', 4, 'G'),
]
const ld16SearchIncidentRefs = [getTtsObjective('16', 3, 'D')]
const ld15MirandaRefs = [
  getTtsObjective('15', 5, 'B'),
  getTtsObjective('15', 5, 'C'),
  getTtsObjective('15', 5, 'F'),
]
const ld15ArrestInfoRefs = [getTtsObjective('15', 4, 'D')]
const ld15InterviewRefs = [
  getTtsObjective('15', 6, 'A'),
  getTtsObjective('15', 6, 'B'),
  getTtsObjective('15', 6, 'C'),
]
const ld20DeescalationRefs = [
  getTtsObjective('20', 2, 'A'),
  getTtsObjective('20', 2, 'D'),
  getTtsObjective('20', 2, 'E'),
]
const ld20ForceSelectionRefs = [
  getTtsObjective('20', 1, 'A'),
  getTtsObjective('20', 1, 'B'),
  getTtsObjective('20', 3, 'C'),
  getTtsObjective('20', 4, 'A'),
  getTtsObjective('20', 4, 'C'),
]
const ld20PostForceRefs = [getTtsObjective('20', 5, 'A')]
const ld20InterventionRefs = [
  getTtsObjective('20', 7, 'C'),
  getTtsObjective('20', 7, 'D'),
  getTtsObjective('20', 7, 'E'),
]
const ld20ReasonablenessArticulationRefs = [
  getTtsObjective('20', 1, 'B'),
  getTtsObjective('20', 4, 'C'),
  getTtsObjective('20', 5, 'A'),
]

const arrestFollowUpVariants: FollowUpVariant[] = [
  {
    objective: formatTtsObjective(
      'custodial interrogation, Miranda administration, and Miranda exceptions',
      ...ld15MirandaRefs,
    ),
    prompt:
      'After officers handcuff the suspect and want to ask questions designed to get incriminating answers about this offense, what should happen first?',
    choices: [
      'Give Miranda warnings and obtain a valid waiver before custodial interrogation unless a recognized exception applies',
      'Ask all offense questions first and read Miranda only if the suspect starts denying involvement',
      'Skip Miranda because any on-scene questioning is automatically admissible',
      'Wait until booking and then question the suspect without warnings because the arrest is already complete',
    ],
    correctIndex: 0,
    explanation:
      'This follows the LD 15 TTS point on when Miranda is required, how it is administered, and when a limited exception may apply during custodial interrogation.',
  },
  {
    objective: formatTtsObjective(
      'information that must be given to an arrested person at the time of arrest',
      ...ld15ArrestInfoRefs,
    ),
    prompt:
      'When officers make the custodial arrest in this scenario, which information must they communicate to the arrested person unless a statutory exception applies?',
    choices: [
      'Their intent to arrest, the cause of the arrest, and their authority to make it',
      'Only the final booking charge and the court date',
      'Only the fact that the suspect can talk to a judge later',
      'Only the identity of every witness who accused the suspect',
    ],
    correctIndex: 0,
    explanation:
      'This is the LD 15 arrest-information TTS point. The tested rule is that officers have to communicate intent, cause, and authority when making the arrest unless the law excuses one of those statements.',
  },
  {
    objective: formatTtsObjective(
      'interview vs interrogation and admissions vs confessions',
      ...ld15InterviewRefs,
    ),
    prompt:
      'Which follow-up step would count as an interrogation rather than a crime-scene interview under the LD 15 TTS?',
    choices: [
      'Questioning the suspect in custody to obtain incriminating statements about the offense',
      'Separating witnesses and asking each what they personally observed',
      'Photographing injuries and property damage at the scene',
      'Collecting spontaneous statements that are volunteered without questioning',
    ],
    correctIndex: 0,
    explanation:
      'LD 15 tests the line between a crime-scene interview and an interrogation. The interrogation is the questioning reasonably likely to elicit incriminating statements from the suspect.',
  },
]

const searchObjectiveProfiles: Record<SearchFocusSeed['category'], SearchObjectiveProfile> = {
  vehicle: {
    authoritySummary: 'motor-vehicle search authority under the automobile exception and related vehicle doctrines',
    authorityRefs: [getTtsObjective('16', 4, 'A')],
    scopeSummary: 'scope limits on a lawful motor-vehicle search',
    scopeRefs: [getTtsObjective('16', 4, 'A')],
    nextStepSummary: 'probable cause to search and keeping the vehicle-search theory lawful',
    nextStepRefs: [getTtsObjective('16', 1, 'D'), getTtsObjective('16', 4, 'A')],
    challengeSummary: 'exclusionary-rule risk if officers cannot tie the vehicle search to the right doctrine',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 4, 'A')],
  },
  'search-condition': {
    authoritySummary: 'probation or parole search authority and control over the place searched',
    authorityRefs: [getTtsObjective('16', 3, 'D')],
    scopeSummary: 'scope limits on probation and parole searches',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'clarifying control before expanding a search-condition search',
    nextStepRefs: [getTtsObjective('16', 3, 'D')],
    challengeSummary: 'admissibility turns on proving the valid search condition and shared control facts',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
  consent: {
    authoritySummary: 'voluntary consent and apparent authority over the searched area',
    authorityRefs: [getTtsObjective('16', 3, 'D')],
    scopeSummary: 'scope limits created by the words and boundaries of consent',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'documenting consent and stopping when consent is narrowed or withdrawn',
    nextStepRefs: [getTtsObjective('16', 3, 'D')],
    challengeSummary: 'suppression risk if consent language or limits are not captured accurately',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
  digital: {
    authoritySummary: 'the difference between seizing a phone and searching digital contents',
    authorityRefs: [getTtsObjective('16', 3, 'D')],
    scopeSummary: 'preserving a device without searching digital evidence beyond the lawful basis',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'seeking the proper search warrant or other lawful digital-search authority',
    nextStepRefs: [getTtsObjective('16', 2, 'A')],
    challengeSummary: 'exclusionary-rule risk if officers treat device seizure as permission to search data',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 2, 'A')],
  },
  'protective-sweep': {
    authoritySummary: 'warrantless protective sweeps based on articulable danger facts',
    authorityRefs: [getTtsObjective('16', 3, 'C'), getTtsObjective('16', 3, 'D')],
    scopeSummary: 'limiting a protective sweep to places where a person could be hiding',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'articulating the specific danger facts instead of describing a general evidence search',
    nextStepRefs: [getTtsObjective('16', 3, 'C'), getTtsObjective('16', 3, 'D')],
    challengeSummary: 'admissibility depends on the safety facts that justified the sweep',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
  'pat-search': {
    authoritySummary: 'cursory or pat-search authority during a lawful detention',
    authorityRefs: [getTtsObjective('16', 3, 'D')],
    scopeSummary: 'a pat search is limited to weapons and immediately apparent contraband',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'recording the specific safety facts that justified the frisk',
    nextStepRefs: [getTtsObjective('16', 3, 'D')],
    challengeSummary: 'suppression risk if officers cannot articulate why the detainee was dangerous',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
  inventory: {
    authoritySummary: 'lawful impound and standardized vehicle inventory authority',
    authorityRefs: [getTtsObjective('16', 4, 'B')],
    scopeSummary: 'inventory scope is controlled by department policy, not evidentiary curiosity',
    scopeRefs: [getTtsObjective('16', 4, 'B')],
    nextStepSummary: 'make sure the impound is lawful and the inventory follows policy',
    nextStepRefs: [getTtsObjective('16', 4, 'B')],
    challengeSummary: 'admissibility turns on policy compliance and a non-pretext inventory',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 4, 'B')],
  },
  'plain-view': {
    authoritySummary: 'plain-view seizures and the immediately apparent incriminating nature of the item',
    authorityRefs: [getTtsObjective('16', 3, 'A'), getTtsObjective('16', 3, 'B')],
    scopeSummary: 'plain view lets officers seize what is lawfully visible, not conduct a new exploratory search',
    scopeRefs: [getTtsObjective('16', 3, 'A'), getTtsObjective('16', 3, 'B')],
    nextStepSummary: 'document the lawful vantage point and lawful access before seizing the item',
    nextStepRefs: [getTtsObjective('16', 3, 'B')],
    challengeSummary: 'suppression risk if officers cannot show lawful vantage, access, and crime-related character',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'B')],
  },
  exigent: {
    authoritySummary: 'exigent-circumstance entry to protect life or stop ongoing harm',
    authorityRefs: [getTtsObjective('16', 3, 'C'), getTtsObjective('16', 3, 'D')],
    scopeSummary: 'exigent searches stay limited to what the emergency requires',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'capture the emergency facts before any broader evidentiary search happens',
    nextStepRefs: [getTtsObjective('16', 3, 'C'), getTtsObjective('16', 3, 'D')],
    challengeSummary: 'admissibility depends on the immediacy of the threat and the limited emergency response',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
  warrant: {
    authoritySummary: 'search-warrant probable cause, execution rules, and nexus to the listed evidence',
    authorityRefs: [getTtsObjective('16', 2, 'A'), getTtsObjective('16', 2, 'E')],
    scopeSummary: 'warrant scope is limited by the warrant language and what could hold the listed evidence',
    scopeRefs: [getTtsObjective('16', 2, 'E')],
    nextStepSummary: 'compare each area or container to the warrant language before opening it',
    nextStepRefs: [getTtsObjective('16', 2, 'D'), getTtsObjective('16', 2, 'E')],
    challengeSummary: 'suppression risk if officers exceed the warrant or ignore nexus limits',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 2, 'E')],
  },
  abandonment: {
    authoritySummary: 'loss of privacy and standing when property is abandoned',
    authorityRefs: [getTtsObjective('16', 1, 'B'), getTtsObjective('16', 1, 'C')],
    scopeSummary: 'search only the property that was actually abandoned',
    scopeRefs: [getTtsObjective('16', 1, 'B'), getTtsObjective('16', 1, 'C')],
    nextStepSummary: 'document the discard and uninterrupted recovery that show abandonment',
    nextStepRefs: [getTtsObjective('16', 1, 'B'), getTtsObjective('16', 1, 'C')],
    challengeSummary: 'admissibility turns on proving the suspect gave up any reasonable expectation of privacy',
    challengeRefs: [getTtsObjective('16', 1, 'B'), getTtsObjective('16', 1, 'C'), getTtsObjective('16', 1, 'E')],
  },
  'search-incident': {
    authoritySummary: 'search incident to arrest of containers immediately associated with the arrestee',
    authorityRefs: [getTtsObjective('16', 3, 'D')],
    scopeSummary: 'keep the search tied to the actual search-incident doctrine and area of control',
    scopeRefs: [getTtsObjective('16', 3, 'D')],
    nextStepSummary: 'articulate why the container was immediately associated with the arrestee',
    nextStepRefs: [getTtsObjective('16', 3, 'D')],
    challengeSummary: 'suppression risk if officers cannot tie the container search to the arrest doctrine they used',
    challengeRefs: [getTtsObjective('16', 1, 'E'), getTtsObjective('16', 3, 'D')],
  },
}

function buildArrestScenario(seed: ArrestFocusSeed, index: number): PracticeTestScenario {
  const followUp = arrestFollowUpVariants[index % arrestFollowUpVariants.length]
  return scenario(seed.id, seed.title, seed.stem, ['15', '16'], [
    question(
      `${seed.id}-q1`,
      '15',
      formatTtsObjective('detention vs consensual encounter and reasonable suspicion', ...ld15DetentionRefs),
      'At the first lawful restraint point in this scenario, what is the best legal classification of the officer contact?',
      [
        seed.stopBasis,
        'A consensual encounter because officers may ask questions and watch the suspect without restricting movement',
        'A de facto arrest because the known facts already establish enough certainty for immediate booking',
        'A community-caretaking contact only because the scene still needs to be stabilized before any criminal investigation can begin',
      ],
      0,
      'This question tracks the LD 15 TTS on differentiating a detention from a consensual encounter and recognizing reasonable suspicion from specific, articulable facts.',
    ),
    question(
      `${seed.id}-q2`,
      '15',
      formatTtsObjective(
        'probable cause and lawful warrantless or warrant arrest authority',
        ...ld15ArrestAuthorityRefs,
      ),
      'Once officers confirm the facts in this scenario, what is the strongest arrest authority?',
      [
        seed.arrestAuthority,
        'Continue the detention and seek more corroboration because the facts amount only to reasonable suspicion, not probable cause',
        'Treat the event as a private-person arrest only because officers cannot make a field arrest unless the offense occurs directly in their presence',
        'Freeze the scene and seek a warrant first because probable cause alone is not enough for immediate custody here',
      ],
      0,
      'This is anchored to the LD 15 arrest TTS. The tested point is whether officers can connect the facts to probable cause and the correct arrest authority, not just assume custody is allowed.',
    ),
    question(
      `${seed.id}-q3`,
      '16',
      formatTtsObjective('search incident to arrest and its scope limits', ...ld16SearchIncidentRefs),
      'If officers make a lawful custodial arrest here, what search authority most directly follows?',
      [
        seed.searchScope,
        'A limited pat search for weapons only, unless a separate doctrine later supports a fuller evidentiary search',
        'A protective sweep of the nearest residence even without facts showing another dangerous person is inside',
        'Immediate review of any phone or cloud account found on the arrestee because it was carried at the time of arrest',
      ],
      0,
      'This is the LD 16 TTS point on warrantless searches incident to arrest. The correct answer stays inside the lawful scope of the arrest doctrine instead of expanding it into places or data the doctrine does not cover.',
    ),
    question(
      `${seed.id}-q4`,
      '15',
      followUp.objective,
      followUp.prompt,
      followUp.choices,
      followUp.correctIndex,
      followUp.explanation,
    ),
  ])
}

function buildSearchScenario(seed: SearchFocusSeed): PracticeTestScenario {
  const objectiveProfile = searchObjectiveProfiles[seed.category]
  return scenario(seed.id, seed.title, seed.stem, ['15', '16'], [
    question(
      `${seed.id}-q1`,
      '16',
      formatTtsObjective(objectiveProfile.authoritySummary, ...objectiveProfile.authorityRefs),
      'What is the strongest search authority in this scenario?',
      [
        seed.authority,
        'A limited officer-safety frisk only, because the facts do not support the broader evidentiary search being considered',
        'Temporary detention while officers seek a warrant, because none of the present facts support immediate warrantless search authority',
        'Search authority based on the suspect’s mere presence at the scene, even without clear control, consent, or probable-cause facts',
      ],
      0,
      'This is anchored to the exact LD 16 TTS doctrine being tested. The strongest answer is the one that matches the legal search theory supported by the facts, not a generalized suspicion.',
    ),
    question(
      `${seed.id}-q2`,
      '16',
      formatTtsObjective(objectiveProfile.scopeSummary, ...objectiveProfile.scopeRefs),
      'Under that authority, what is the proper scope limitation?',
      [
        seed.scope,
        'Search any container or room the suspect has recently accessed, even if the doctrine does not reach that area',
        'Search the entire property for evidence of any crime once one lawful basis for entry or search exists',
        'Delay opening containers that are otherwise within scope until the suspect gives a fresh post-search statement',
      ],
      0,
      'The LD 16 TTS tests not just whether officers have authority, but also whether they stay inside the correct scope of that doctrine.',
    ),
    question(
      `${seed.id}-q3`,
      '16',
      formatTtsObjective(objectiveProfile.nextStepSummary, ...objectiveProfile.nextStepRefs),
      'Which next step best keeps the investigation lawful as the scene develops?',
      [
        seed.nextStep,
        'Expand the search now and rely on later report writing to align the facts with a legal doctrine',
        'Use blanket consent language after the fact to cover areas officers already decided to search',
        'Rely entirely on a suspect admission or denial instead of documenting the objective facts that create the search authority',
      ],
      0,
      'This is a TTS-based follow-up question about staying inside the doctrine actually authorizing the search. Officers have to preserve the right theory before they expand the search or seize more evidence.',
    ),
    question(
      `${seed.id}-q4`,
      '16',
      formatTtsObjective(objectiveProfile.challengeSummary, ...objectiveProfile.challengeRefs),
      'If this search is challenged later, which fact pattern best protects the evidence from suppression?',
      [
        seed.reportDetail,
        'Mainly the officer’s intuition that the suspect was being deceptive, even if the underlying authority facts are thin',
        'The fact that contraband was ultimately found, even if the original authority and scope were not clearly documented',
        'General experience with similar cases in the area, without tying the specific scene facts to the search doctrine used',
      ],
      0,
      'This is tied to the LD 16 exclusionary-rule and search-doctrine TTS points. Admissibility turns on the facts showing lawful authority, lawful scope, and a clean connection between the doctrine used and the evidence seized.',
    ),
  ])
}

function buildForceScenario(seed: ForceFocusSeed): PracticeTestScenario {
  const hasInterventionAngle = seed.id === 'ld152016-focus-46'
  return scenario(seed.id, seed.title, seed.stem, ['20'], [
    question(
      `${seed.id}-q1`,
      '20',
      formatTtsObjective(
        'deescalation, time-distance-cover, and strategic communication',
        ...ld20DeescalationRefs,
      ),
      'At the first decision point, which response best reflects LD 20 force principles?',
      [
        seed.initialResponse,
        'Close distance immediately for hands-on control before evaluating cover, containment, or communication options',
        'Hold position without engaging verbally or repositioning bystanders until the subject makes the next move',
        'Focus entirely on the subject and delay scene management for uninvolved people until after physical control is gained',
      ],
      0,
      'This question is based on the LD 20 TTS deescalation points. The correct response uses self-control, scene management, communication, and tactical positioning before escalating force.',
    ),
    question(
      `${seed.id}-q2`,
      '20',
      formatTtsObjective(
        'objective reasonableness and selecting a force option that matches the threat',
        ...ld20ForceSelectionRefs,
      ),
      'If force becomes necessary on these facts, which option is most defensible under LD 20?',
      [
        seed.forceOption,
        'Use the highest available force option immediately to end the event quickly, even if lower options remain tactically reasonable',
        'Continue only verbal efforts even after the subject presents an imminent assaultive threat that lesser responses cannot safely manage',
        'Base the force choice mainly on the subject’s past history or offense type instead of the current threat, resistance, and scene conditions',
      ],
      0,
      'This tracks the LD 20 TTS on objective reasonableness, force options, and deadly-force considerations when applicable. The correct answer matches the threat, resistance, and totality of circumstances known at the moment force is used.',
    ),
    question(
      `${seed.id}-q3`,
      '20',
      formatTtsObjective(
        hasInterventionAngle
          ? 'intervening when another officer uses unreasonable force'
          : 'post-force medical, supervisory, and documentation duties',
        ...(hasInterventionAngle ? ld20InterventionRefs : ld20PostForceRefs),
      ),
      'After the force event is over and the scene is stabilized, what immediate duty remains?',
      [
        seed.postForceDuty,
        'Clear the scene first and handle medical care, witness identification, and evidence preservation later if time permits',
        'Delay medical attention until transport or booking is arranged so the scene report can be finished first',
        'Rely on body-worn video alone instead of making notifications, securing evidence, or documenting witness accounts',
      ],
      0,
      hasInterventionAngle
        ? 'This scenario is keyed to the LD 20 TTS on intervention. The next duty is to stop unreasonable force, take control of the scene, and ensure the event is reported and reviewed.'
        : 'This is the LD 20 documentation TTS point. After force, officers still have to handle medical care, supervision notification, scene security, and complete reporting.',
    ),
    question(
      `${seed.id}-q4`,
      '20',
      formatTtsObjective(
        hasInterventionAngle
          ? 'self-control, intervention, and documenting unreasonable force'
          : 'articulating the facts that made force objectively reasonable',
        ...(hasInterventionAngle ? ld20InterventionRefs : ld20ReasonablenessArticulationRefs),
      ),
      hasInterventionAngle
        ? 'Which fact matters most in showing that the officer met the LD 20 duty to intercede?'
        : 'Which fact matters most in showing that the force decision stayed objectively reasonable under the TTS?',
      [
        seed.reportDetail,
        'Mainly the officer’s personal fear response, even if the objective threat cues were not specifically articulated',
        'The fact that the suspect was eventually arrested, even without explaining the resistance and decision points leading to force',
        'That other officers were present and generally agreed with the decision after the event, even without specific scene facts',
      ],
      0,
      hasInterventionAngle
        ? 'The LD 20 intervention TTS focuses on what the officer saw, when the subject became compliant, and what intervention steps were taken to stop unreasonable force.'
        : 'The LD 20 TTS expects officers to articulate the specific threat cues, resistance, distance, warnings, available options, and post-force actions that make the force objectively reasonable.',
    ),
  ])
}

const arrestSeeds: ArrestFocusSeed[] = [
  {
    id: 'ld152016-focus-01',
    title: 'Apartment Breezeway DV Suspect',
    stem: 'Officers respond to a 911 domestic violence call at an apartment complex. A crying victim points to Marcos walking away down the breezeway and says he just punched her, grabbed her phone, and threatened to come back with a gun. Officers see fresh redness on her face and recover the damaged phone near the doorway.',
    stopBasis: 'An investigative detention supported by the victim’s immediate statement, visible injury, and Marcos matching the described suspect',
    arrestAuthority: 'A warrantless arrest supported by probable cause from the victim statement, visible injury, threat evidence, and the recovered phone',
    searchScope: 'Search Marcos and items immediately associated with his person incident to a lawful custodial arrest',
    reportDetail: 'The victim’s spontaneous statement, the visible facial injury, Marcos’s exact location when contacted, and recovery of the damaged phone',
  },
  {
    id: 'ld152016-focus-02',
    title: 'Bar Patio Bottle Battery',
    stem: 'Security at a crowded bar detains Tiana after several patrons point her out as the woman who smashed a beer bottle into another customer’s shoulder. Officers arrive to find the victim bleeding, security video rolling on a nearby monitor, and Tiana yelling that she only “swung once” after an argument.',
    stopBasis: 'An investigative detention based on witness identification, security involvement, and fresh injury evidence',
    arrestAuthority: 'A warrantless arrest based on probable cause for the assault from witnesses, visible injury, video confirmation, and Tiana’s admission',
    searchScope: 'A search incident to arrest of Tiana’s person and the items immediately in her possession',
    reportDetail: 'Who identified Tiana, the victim’s visible injury, what the video showed, and Tiana’s exact spontaneous statement',
  },
  {
    id: 'ld152016-focus-03',
    title: 'Restraining Order Grocery Lot Contact',
    stem: 'A protected party tells officers that her restrained ex-boyfriend, Nolan, followed her through a grocery store parking lot, blocked her car door, and kept texting that he would “make her talk.” Dispatch confirms an active criminal protective order, and officers watch Nolan approach again while the victim points him out.',
    stopBasis: 'A detention based on the victim’s contemporaneous report, dispatch confirmation of the order, and officers observing Nolan re-approach',
    arrestAuthority: 'A warrantless arrest supported by probable cause that Nolan knowingly violated the protective order in the officers’ presence and through the reported conduct',
    searchScope: 'A search incident to arrest of Nolan’s person and the property immediately associated with him',
    reportDetail: 'Order confirmation, the protected party’s statement, the exact distance and conduct Nolan used in the lot, and any threatening texts shown to officers',
  },
  {
    id: 'ld152016-focus-04',
    title: 'Robbery Show-Up Near Transit Stop',
    stem: 'Minutes after a strong-arm robbery outside a transit stop, officers stop Devin two blocks away because he matches the suspect description and is carrying cash folded around the victim’s transit card. The victim is brought for a field show-up and immediately says, “That is the guy who shoved me and took my wallet.”',
    stopBasis: 'A detention supported by the close time-and-distance match, the suspect description, and possession of suspicious property tied to the robbery',
    arrestAuthority: 'A warrantless robbery arrest supported by the victim’s show-up identification and possession of property directly linking Devin to the crime',
    searchScope: 'Search Devin and items on his person incident to custodial arrest for weapons, stolen property, and evidence',
    reportDetail: 'The description broadcast, time and distance from the robbery, the victim’s show-up statement, and the exact items recovered from Devin',
  },
  {
    id: 'ld152016-focus-05',
    title: 'Garage Burglary Suspect Exiting Fence Line',
    stem: 'At 0315 hours, officers respond to a residential burglary call and see Raul climbing out of a side yard carrying a tool bag and a laptop case. The homeowner runs outside and says Raul was never invited onto the property and just kicked open the side garage door.',
    stopBasis: 'A detention supported by Raul’s late-night flight from the fenced yard while carrying suspected stolen property',
    arrestAuthority: 'A warrantless burglary arrest based on the homeowner’s immediate statement, forced entry facts, and Raul leaving with the property',
    searchScope: 'Search Raul and the containers immediately associated with him incident to a lawful custodial arrest',
    reportDetail: 'Point of entry, the homeowner’s statement, the location of Raul when first seen, and a detailed description of the property he carried out',
  },
  {
    id: 'ld152016-focus-06',
    title: 'School Pickup Child Abuse Investigation',
    stem: 'A school resource officer is asked to meet with a teacher and nurse about eight-year-old Mia, who has fresh loop-shaped bruising on both legs. Mia says her uncle Darnell hit her with an extension cord the night before because she spilled juice. Darnell arrives at pickup and angrily tries to take Mia before officers finish interviewing staff.',
    stopBasis: 'A detention supported by the child’s statement, the visible injuries, and Darnell’s attempt to remove the child during the active investigation',
    arrestAuthority: 'A warrantless arrest supported by probable cause from the child disclosure, corroborating injuries, and the identified caretaker relationship',
    searchScope: 'A search incident to arrest of Darnell’s person and the property immediately associated with him',
    reportDetail: 'The child’s exact disclosure, the nurse’s injury description, photographs or body-worn documentation of the injuries, and Darnell’s conduct at pickup',
  },
  {
    id: 'ld152016-focus-07',
    title: 'Construction Site Felony Vandalism',
    stem: 'Security calls officers to a closed construction site where Kelsey is caught spray-painting heavy equipment and smashing instrument panels with a framing hammer. The foreman estimates the damage is several thousand dollars and tells officers Kelsey was fired from the site earlier in the week.',
    stopBasis: 'A detention supported by security identification, fresh property damage, and Kelsey being found on the closed site with the hammer',
    arrestAuthority: 'A warrantless arrest based on probable cause for vandalism supported by officer observations, security witness statements, and the scale of the damage',
    searchScope: 'A search incident to arrest of Kelsey’s person and the items she is carrying, including paint cans and tools',
    reportDetail: 'The exact damaged items, estimated damage, where Kelsey was found, and what tools or paint were in her possession',
  },
  {
    id: 'ld152016-focus-08',
    title: 'Injury Hit-and-Run Driver Contact',
    stem: 'Officers locate Omar at a body shop less than an hour after a hit-and-run collision with injury. The victim identified the truck’s plate, and the truck now has fresh front-end damage, a cracked headlamp, and a bicycle lodged under the bumper. Omar says he “panicked and kept driving.”',
    stopBasis: 'A detention based on the matching vehicle, recent collision damage, and direct evidence tying Omar to the injury collision',
    arrestAuthority: 'A warrantless arrest supported by probable cause from the vehicle evidence, plate match, injury collision facts, and Omar’s admission',
    searchScope: 'A search incident to arrest of Omar and the items immediately associated with him if the arrest is custodial',
    reportDetail: 'The plate connection, the physical vehicle damage, the bicycle evidence, the timing of the contact, and Omar’s statement',
  },
  {
    id: 'ld152016-focus-09',
    title: 'Stolen Vehicle Driver Bailout',
    stem: 'A vehicle taken in a carjacking two hours earlier is found idling in an alley. When officers pull in behind it, the driver, Jalen, runs and tosses the key fob under a dumpster. The victim later describes the driver’s jacket and says the carjacker threatened her with a knife.',
    stopBasis: 'A detention supported by Jalen’s flight from the recently stolen vehicle and the matching suspect description',
    arrestAuthority: 'A warrantless arrest based on probable cause tying Jalen to possession of the carjacked vehicle and the victim’s description',
    searchScope: 'A search incident to arrest of Jalen and the property immediately associated with him after lawful custody',
    reportDetail: 'Where Jalen was first seen, the timing from the carjacking, the tossed key fob, and the victim’s matching description',
  },
  {
    id: 'ld152016-focus-10',
    title: 'Confirmed Warrant at Bus Stop',
    stem: 'An officer conducting a field interview with Priya at a bus stop learns through dispatch that Priya has a confirmed no-bail felony warrant with matching identifiers. Priya becomes increasingly nervous and reaches toward a shoulder bag while asking if she can leave before backup arrives.',
    stopBasis: 'A detention based on the confirmed warrant return and officer safety concerns while awaiting control of the scene',
    arrestAuthority: 'A warrant arrest supported by dispatch confirmation and matching identifiers tying Priya to the active felony warrant',
    searchScope: 'A search incident to arrest of Priya and the shoulder bag immediately associated with her once she is lawfully arrested',
    reportDetail: 'The warrant confirmation details, the identifiers used to verify Priya’s identity, and her movements toward the shoulder bag',
  },
  {
    id: 'ld152016-focus-11',
    title: 'Park Assault With a Bat',
    stem: 'Witnesses flag down officers in a park and point to Elias, who is holding a metal bat while a victim lies on the grass with a deep forearm laceration. Several witnesses say Elias swung at the victim after accusing him of stealing a backpack, and officers see the backpack lying nearby.',
    stopBasis: 'A detention supported by the live witness identifications, Elias holding the bat, and the victim’s visible injury',
    arrestAuthority: 'A warrantless arrest supported by probable cause for assault with a deadly weapon based on witness statements, the bat, and the victim’s injury',
    searchScope: 'A search incident to arrest of Elias and the property immediately associated with him after custody is established',
    reportDetail: 'Which witnesses saw the swing, where the bat and backpack were found, and the victim’s observed injury pattern',
  },
  {
    id: 'ld152016-focus-12',
    title: 'Porch Theft Suspect With Open Packages',
    stem: 'A homeowner shows officers doorbell video of Bree stealing two packages from the porch ten minutes earlier. Officers stop Bree around the corner carrying opened boxes containing the homeowner’s medication and electronics. Bree says she “only wanted to see what was inside.”',
    stopBasis: 'A detention supported by the fresh video identification and Bree’s possession of the opened stolen packages',
    arrestAuthority: 'A warrantless theft-related arrest supported by the video, the recovered property, and Bree’s possession of the stolen items moments later',
    searchScope: 'A search incident to arrest of Bree and the containers immediately associated with her',
    reportDetail: 'The timing from theft to stop, the doorbell video observations, the package contents recovered, and Bree’s statement',
  },
  {
    id: 'ld152016-focus-13',
    title: 'Loss Prevention Force Shoplift',
    stem: 'Store loss prevention tells officers that Andre concealed cologne and walked past the last point of sale without paying. When confronted outside, Andre shoved the employee into a cart corral and tried to run before officers arrived. The concealed merchandise is still in Andre’s jacket pocket.',
    stopBasis: 'A detention based on the detailed loss-prevention observations and Andre’s use of force while fleeing with the merchandise',
    arrestAuthority: 'A warrantless arrest supported by probable cause for robbery or forceful theft based on the employee statement and recovery of the concealed property',
    searchScope: 'A search incident to arrest of Andre’s person and the items immediately associated with him',
    reportDetail: 'Exactly where concealment occurred, the last point of sale, the shove described by the employee, and where the merchandise was recovered',
  },
  {
    id: 'ld152016-focus-14',
    title: 'Family Court Exchange Violation',
    stem: 'During a monitored child exchange, officers are called when Serena refuses to return the child to the legal custodian and drives away despite the written custody order shown to officers at the scene. Patrol units stop Serena minutes later with the child still in the back seat.',
    stopBasis: 'A detention supported by the active custody dispute, the displayed court order, and Serena’s recent flight with the child',
    arrestAuthority: 'A warrantless arrest supported by probable cause from the court order, witness statements, and Serena’s refusal to return the child',
    searchScope: 'A search incident to arrest of Serena and the items immediately associated with her once the child is safely removed',
    reportDetail: 'What the custody order authorized, who displayed it, Serena’s conduct during the exchange, and when officers stopped the vehicle',
  },
  {
    id: 'ld152016-focus-15',
    title: 'Hand-to-Hand Fentanyl Sale',
    stem: 'Narcotics officers watch Luis exchange small blue pills for cash in a parking lot. When officers move in, the buyer immediately says he just bought fentanyl pills from Luis, and officers recover the buy money and several matching pills from Luis’s front pocket.',
    stopBasis: 'A detention supported by direct officer observation of the hand-to-hand exchange and immediate corroboration from the buyer',
    arrestAuthority: 'A warrantless arrest based on probable cause from the observed sale, buyer statement, and recovery of cash and pills from Luis',
    searchScope: 'A search incident to arrest of Luis’s person and items immediately associated with him for drugs, currency, and evidence',
    reportDetail: 'The officer observations of the exchange, the buyer’s statement, the denominations of the money, and where the pills were recovered',
  },
  {
    id: 'ld152016-focus-16',
    title: 'Gun Prohibited Person Contact',
    stem: 'Officers contact Ramon during a disturbance call and learn through dispatch that he is a restrained person prohibited from possessing firearms. A witness says Ramon tucked a small revolver into his waistband before walking behind a parked truck, and officers recover the loaded revolver exactly where the witness indicated.',
    stopBasis: 'A detention supported by the witness statement, the prohibition information from dispatch, and the recovered firearm',
    arrestAuthority: 'A warrantless arrest supported by probable cause that Ramon, a prohibited person, possessed the recovered firearm',
    searchScope: 'A search incident to arrest of Ramon and the property immediately associated with him after custodial arrest',
    reportDetail: 'Dispatch confirmation of the prohibition, the witness’s exact description of the waistband movement, and the firearm recovery location',
  },
  {
    id: 'ld152016-focus-17',
    title: 'Felony Probation Absconder Contact',
    stem: 'A probation officer asks patrol to assist after seeing his absconding client, Theo, enter a motel room despite a full-search condition and a no-contact order involving another parolee staying there. When Theo steps back outside, he turns away and tries to re-enter the room after officers identify themselves.',
    stopBasis: 'A detention supported by the probation officer’s direct identification and Theo’s evasive movement back toward the motel room',
    arrestAuthority: 'A warrantless arrest supported by the probation officer’s information and the confirmed warrant or violation basis tied to Theo’s absconding status',
    searchScope: 'A search incident to arrest of Theo and items immediately associated with him after lawful custody',
    reportDetail: 'The probation officer’s identification, the search condition or warrant information, Theo’s attempt to retreat, and where the contact occurred',
  },
]

const searchSeeds: SearchFocusSeed[] = [
  {
    id: 'ld152016-focus-18',
    title: 'Odor From Sedan Center Console',
    stem: 'During a lawful traffic stop, officers smell a strong fresh marijuana odor coming from a sedan and see loose plastic bindles on the passenger seat. The driver, Casey, keeps glancing toward the center console and says there is “nothing important in there.”',
    category: 'vehicle',
    authority: 'A vehicle search based on probable cause that the car contains contraband or evidence of a drug offense',
    scope: 'Search only the areas and containers in the vehicle where the suspected contraband or evidence could reasonably be found',
    nextStep: 'Clearly document the observations creating probable cause before expanding the vehicle search',
    reportDetail: 'The odor, visible bindles, Casey’s movements toward the console, and the exact places searched inside the car',
  },
  {
    id: 'ld152016-focus-19',
    title: 'Probation Search at a Motel Room',
    stem: 'Officers contact Keon outside a motel and confirm he is on searchable probation for narcotics. Keon admits he rented Room 12 and says his backpack and clothes are inside. When officers enter with the probation officer, another guest immediately claims a zipped pouch on the nightstand belongs to her.',
    category: 'search-condition',
    authority: 'A probation search tied to Keon’s valid search condition and his control over the motel room he rented',
    scope: 'Search only areas and containers reasonably under Keon’s control unless separate authority develops for property clearly belonging only to another person',
    nextStep: 'Clarify ownership and control over disputed property before searching a container someone else specifically claims',
    reportDetail: 'The exact search condition, Keon’s admission that he rented the room, who claimed the pouch, and why officers believed each searched area was under Keon’s control',
  },
  {
    id: 'ld152016-focus-20',
    title: 'Consent Apartment Search',
    stem: 'After a theft investigation, Jamie tells officers they can “come in and look around” her apartment because she has nothing to hide. Jamie then unlocks the door and leads officers inside. While officers search the living room, Jamie says, “Do not go into my roommate’s bedroom.”',
    category: 'consent',
    authority: 'A consent search based on Jamie’s voluntary permission and apparent authority over the areas she controls',
    scope: 'Limit the search to the areas Jamie actually consented to and do not exceed the boundaries she clearly set',
    nextStep: 'Document the exact words of consent and any later limitations before searching additional rooms or containers',
    reportDetail: 'Who gave consent, the exact consent language, Jamie’s conduct in opening the door, and the point at which she limited the search',
  },
  {
    id: 'ld152016-focus-21',
    title: 'Cell Phone After Narcotics Arrest',
    stem: 'Officers arrest Nia for selling fentanyl and seize two cell phones from her pockets. A detective wants to open the phones immediately at the curb to look for recent deals and customer messages while Nia is waiting for transport.',
    category: 'digital',
    authority: 'Seize and preserve the phones incident to arrest, but obtain separate legal authority before searching their digital contents',
    scope: 'Secure the physical phone and prevent destruction of evidence without exploring digital data until lawful authority is obtained',
    nextStep: 'Write the probable cause for the device search and seek the proper warrant or other lawful digital-search authorization',
    reportDetail: 'Where the phones were recovered, why officers believed they contained evidence, and what steps were taken to preserve rather than search the data',
  },
  {
    id: 'ld152016-focus-22',
    title: 'Protective Sweep After Armed DV Arrest',
    stem: 'Officers arrest Malik in the front room of a house for felony domestic violence after the victim reports he pointed a handgun at her. While escorting Malik outside, officers hear movement in the rear hallway and notice a bedroom door partly open with men’s shoes and a second holster on the floor.',
    category: 'protective-sweep',
    authority: 'A limited protective sweep based on articulable facts that another dangerous person may still be inside',
    scope: 'Check only places where a person could be hiding and stop once the safety concern is resolved',
    nextStep: 'Articulate the specific safety facts that justified the sweep instead of describing it as a general evidence search',
    reportDetail: 'The victim’s report of the gun, the movement heard in the hallway, the open door, and why officers believed another person could be present',
  },
  {
    id: 'ld152016-focus-23',
    title: 'Passenger Purse in Drug Car',
    stem: 'A K-9 alerts on a vehicle stopped for a lane violation. During the search, officers find drug packaging in the rear seat and a zipped purse at the front passenger’s feet. The passenger says the purse is hers and tries to pull it onto her lap when officers reach for it.',
    category: 'vehicle',
    authority: 'A vehicle search based on probable cause that allows inspection of containers in the car that could hold the suspected contraband',
    scope: 'Search only containers in the vehicle that could reasonably conceal the object of the search',
    nextStep: 'Tie the purse search to the existing probable cause and document where the purse was located when the search began',
    reportDetail: 'The K-9 alert, the drug packaging already located, the purse position at the passenger’s feet, and the passenger’s movement toward it',
  },
  {
    id: 'ld152016-focus-24',
    title: 'Night Prowler Patsearch',
    stem: 'At 0200 hours, officers detain Jonah behind closed businesses after a silent alarm. Jonah keeps his right hand jammed in his hoodie pocket, repeatedly angles his body away from officers, and ignores two commands to show his hands while glancing at a nearby fence line.',
    category: 'pat-search',
    authority: 'A limited patsearch for weapons based on specific facts suggesting Jonah may be armed and presently dangerous',
    scope: 'Pat only for weapons and seize an item only if its contour or feel lawfully reveals it as a weapon or contraband',
    nextStep: 'Clearly articulate the hand movements, refusal to show hands, body blading, and location factors before conducting the frisk',
    reportDetail: 'The silent alarm context, Jonah’s hand placement, ignored commands, and the objective safety reasons for the frisk',
  },
  {
    id: 'ld152016-focus-25',
    title: 'Tow Inventory Search',
    stem: 'After arresting a driver for a no-bail warrant, officers decide to tow the car from a no-parking red zone. Before the tow truck arrives, an officer begins an inventory according to department policy and finds a loaded pistol in an unlocked duffel bag on the back seat.',
    category: 'inventory',
    authority: 'A standardized inventory search connected to the lawful impound of the vehicle',
    scope: 'Follow department inventory policy and document the areas and containers opened under that policy',
    nextStep: 'Make sure the impound decision is lawful and the inventory follows policy rather than using the tow as a pretext for an evidentiary search',
    reportDetail: 'Why the car was impounded, what policy governed the inventory, and where in the car the duffel bag and pistol were located',
  },
  {
    id: 'ld152016-focus-26',
    title: 'Plain View Handgun in Welfare Check',
    stem: 'Officers enter a home during a welfare check after a family member reports possible overdose concerns. While checking the living room for the named subject, officers see a short-barreled shotgun lying on a couch next to open narcotics paraphernalia in plain sight.',
    category: 'plain-view',
    authority: 'Plain-view seizure of items officers lawfully observe while inside for the welfare check',
    scope: 'Seize only items whose incriminating character is immediately apparent from the lawful vantage point unless more authority develops',
    nextStep: 'Document why officers were lawfully inside and exactly where the weapon and paraphernalia were seen before any seizure',
    reportDetail: 'The welfare-check reason for entry, the officers’ lawful position in the room, and what made the weapon and paraphernalia immediately apparent',
  },
  {
    id: 'ld152016-focus-27',
    title: 'Exigent Entry for Screaming Child',
    stem: 'Neighbors call 911 after hearing a woman scream and a child cry, “Stop hurting my mom.” Officers reach the apartment door, hear crashing sounds inside, and a small child opens the door crying while pointing deeper into the apartment.',
    category: 'exigent',
    authority: 'An exigent entry based on an immediate need to protect occupants from ongoing harm',
    scope: 'Limit the search to what is reasonably necessary to address the emergency and locate threatened persons',
    nextStep: 'Document the sounds, statements, and observations that created the emergency before any broader evidentiary search occurs',
    reportDetail: 'The neighbor statements, the screams and crashing heard at the door, the child’s statement, and the locations officers checked after entry',
  },
  {
    id: 'ld152016-focus-28',
    title: 'Garage Warrant Scope',
    stem: 'Detectives serve a search warrant for stolen power tools at a residence. The warrant specifically lists the house, attached garage, and vehicles under the suspect’s control. In the garage, officers find a locked toolbox large enough to hold the missing tools and a separate sealed envelope on a workbench.',
    category: 'warrant',
    authority: 'A warrant-based search of the listed premises and containers that can reasonably hold the described evidence',
    scope: 'Open only areas and containers within the warrant scope that could reasonably contain the property described in the warrant',
    nextStep: 'Compare each area and container searched to the warrant language and the size of the listed evidence before opening it',
    reportDetail: 'The exact warrant language, the areas authorized, and why the toolbox or other container could contain the described property',
  },
  {
    id: 'ld152016-focus-29',
    title: 'Parole Search Shared Bedroom',
    stem: 'Officers conduct a parole search at a duplex bedroom used by parolee Brixton. Brixton’s girlfriend says half the room and one dresser are exclusively hers, but Brixton’s clothing, mail, and a parole report form are mixed throughout the rest of the room.',
    category: 'search-condition',
    authority: 'A parole search of areas over which Brixton has access, possession, or control under the valid search condition',
    scope: 'Search the areas reasonably under Brixton’s control but do not automatically treat clearly exclusive property of another person as searchable',
    nextStep: 'Separate jointly controlled areas from items credibly claimed as exclusively another person’s before opening containers',
    reportDetail: 'The parole condition, where Brixton’s property was found, the mixed-use areas of the room, and which items were claimed as exclusively the girlfriend’s',
  },
  {
    id: 'ld152016-focus-30',
    title: 'Backpack Left in Stolen Car',
    stem: 'After arresting Maya for driving a recently stolen vehicle, officers see a backpack on the passenger floorboard. Maya first says it is not hers, then asks officers not to open it because “there are personal things inside.”',
    category: 'vehicle',
    authority: 'Search authority tied to the vehicle exception or search incident to arrest only if the legal facts support that specific basis',
    scope: 'Keep the backpack search within the doctrine that actually applies and do not assume a blanket right to search it for any reason',
    nextStep: 'Articulate whether the backpack search is based on vehicle probable cause, lawful inventory, or another specific doctrine before opening it',
    reportDetail: 'Maya’s statements about ownership, the backpack’s location in the car, and the exact legal basis relied on before the search',
  },
  {
    id: 'ld152016-focus-31',
    title: 'Locked Can in Meth Lab Vehicle',
    stem: 'Officers stop a van after seeing chemical containers and tubing through the rear windows. A strong chemical odor comes from the van, and the driver admits there may be “old cook stuff” inside. In the cargo area officers find a locked metal ammo can.',
    category: 'vehicle',
    authority: 'A vehicle search based on probable cause that the van contains evidence or contraband tied to methamphetamine manufacturing',
    scope: 'Search any container in the van that could reasonably hold the items officers have probable cause to look for',
    nextStep: 'Document the odor, visible chemicals, admission, and the reasons the locked ammo can could contain the suspected evidence',
    reportDetail: 'The chemical odor, the visible lab components, the driver’s statement, and why the ammo can fell within the probable-cause scope',
  },
  {
    id: 'ld152016-focus-32',
    title: 'Backpack at Feet During Custodial Arrest',
    stem: 'Officers arrest Selena on a confirmed felony warrant while she is seated on a bus bench with a backpack leaning against her shin. As officers handcuff her, Selena twists to place one hand on the backpack and says she needs her medication from inside.',
    category: 'search-incident',
    authority: 'A search incident to arrest of a container immediately associated with Selena and within her area of control at the time of arrest',
    scope: 'Search the backpack only under the lawful basis that applies at the moment of custody and document why it was associated with Selena',
    nextStep: 'Describe the backpack’s location and Selena’s movement toward it before opening it as part of the arrest process',
    reportDetail: 'Where the backpack was positioned, Selena’s reach toward it, and why officers considered it immediately associated with her person',
  },
  {
    id: 'ld152016-focus-33',
    title: 'Abandoned Purse in Alley',
    stem: 'While officers chase a burglary suspect on foot, the suspect throws a purse over a fence into a public alley and keeps running. Officers recover the purse exactly where it landed and find residential keys, a screwdriver, and jewelry inside.',
    category: 'abandonment',
    authority: 'A search of abandoned property because the suspect relinquished any reasonable expectation of privacy by discarding it while fleeing',
    scope: 'Search only the property actually abandoned and clearly document the act showing abandonment',
    nextStep: 'Record the suspect’s act of throwing the purse away and the recovery location before searching it',
    reportDetail: 'The suspect’s discard movement, the alley location, who saw the throw, and the uninterrupted recovery of the purse',
  },
  {
    id: 'ld152016-focus-34',
    title: 'Phone Search Request After Firearm Arrest',
    stem: 'Officers arrest Tarek after finding a concealed firearm in his waistband during a lawful frisk. A detective wants to search Tarek’s phone immediately because texts may reveal whether the gun was being sold or traded.',
    category: 'digital',
    authority: 'Seize the phone if lawfully possessed, but obtain additional legal authority before searching its digital contents',
    scope: 'Preserve the device without searching digital data until the lawful basis for the phone search is obtained',
    nextStep: 'Write the probable cause connecting the phone to the firearm offense and seek the proper digital-search authorization',
    reportDetail: 'Why officers believed the phone might contain relevant evidence and what steps were taken to preserve it without a warrantless digital search',
  },
]

const forceSeeds: ForceFocusSeed[] = [
  {
    id: 'ld152016-focus-35',
    title: 'Rooftop Knife Crisis',
    stem: 'Officers respond to a parking-structure rooftop where Adrian is standing near the edge with a knife and yelling that no one should come closer. One officer keeps distance and cover while another clears civilians below. Adrian briefly lowers the knife, then suddenly rushes toward officers while a less-lethal launcher and lethal cover are both in position.',
    initialResponse: 'Use time, distance, cover, communication, and scene control while coordinating less-lethal and lethal-cover roles',
    forceOption: 'Use the option that is objectively reasonable to stop the imminent threat based on Adrian’s sudden armed rush and available force tools',
    postForceDuty: 'Secure the knife, handcuff if safe, summon medical aid immediately, and preserve the scene for review',
    reportDetail: 'Adrian’s distance from officers, the knife presentation, the warnings given, the rush toward officers, and which force options were available',
  },
  {
    id: 'ld152016-focus-36',
    title: 'Freeway DUI Shoulder Fight',
    stem: 'During a DUI stop on a freeway shoulder, Briana suddenly pulls away from officers, shoves one officer into traffic-side danger, and starts throwing closed-fist punches. Passing traffic is close, and there is little room to disengage safely.',
    initialResponse: 'Use clear commands, team control, and the safest available positioning while accounting for the traffic hazard',
    forceOption: 'Use the level of force reasonably necessary to stop the assault and regain control before Briana or an officer is pushed into traffic',
    postForceDuty: 'Move the scene to safety if possible, assess injuries, request medical attention if needed, and notify supervision',
    reportDetail: 'Traffic conditions, Briana’s assaultive behavior, the danger of the shoulder location, and why immediate control was necessary',
  },
  {
    id: 'ld152016-focus-37',
    title: 'Domestic Bat Advance',
    stem: 'A victim flees a residence and tells officers her boyfriend, Colton, is inside breaking furniture with a wooden bat. When officers make contact in the front yard, Colton advances while raising the bat shoulder-high and refusing repeated commands to stop.',
    initialResponse: 'Maintain distance, use cover, give clear commands, and coordinate force options before Colton closes the gap',
    forceOption: 'Use the force option that is objectively reasonable to stop the immediate assault threat created by Colton advancing with the bat',
    postForceDuty: 'Disarm Colton when safe, secure the scene, render or summon medical aid, and separate witnesses for statements',
    reportDetail: 'The bat’s position, Colton’s movement toward officers, command compliance or refusal, distance, and the risk of serious injury',
  },
  {
    id: 'ld152016-focus-38',
    title: 'Dog Attack During Arrest Attempt',
    stem: 'Officers attempt to arrest a burglary suspect in a backyard when the suspect releases a large dog that immediately charges and bites one officer’s forearm. The suspect backs toward a side gate while yelling for the dog to keep attacking.',
    initialResponse: 'Address the immediate dog threat while maintaining awareness of the suspect’s escape route and coordinating officers on scene',
    forceOption: 'Use the objectively reasonable force necessary to stop the active dog attack and the continuing threat it presents',
    postForceDuty: 'Secure the suspect and dog situation, treat the bite injury, and document the suspect’s role in directing the dog',
    reportDetail: 'The dog’s behavior, the bite, the suspect’s commands to the dog, officer positions, and the force used to stop the attack',
  },
  {
    id: 'ld152016-focus-39',
    title: 'Fleeing Assault Suspect With Taser Window',
    stem: 'A suspect who just punched a security guard at a concert sprints toward a fenced dead end while ignoring commands. He is unarmed, keeps looking over his shoulder, and repeatedly reaches toward the latch on a gate that opens into a dense crowd exiting the venue.',
    initialResponse: 'Use commands, containment, and the safest option to prevent the suspect from re-entering the crowd and causing more harm',
    forceOption: 'Use an objectively reasonable force option to stop the suspect before he re-enters the crowd if lower-force control is not practical',
    postForceDuty: 'Move the suspect away from the crowd, monitor his condition, and document the threat to the exiting public',
    reportDetail: 'The assault just committed, the suspect’s flight path toward the crowd, warning opportunities, and why immediate control mattered',
  },
  {
    id: 'ld152016-focus-40',
    title: 'Bottle Thrower in Festival Crowd',
    stem: 'At a street festival, officers see Sierra throw two glass bottles toward a cluster of patrons and then square up with fists clenched when approached. People behind Sierra are backing away, and one child is knocked down in the confusion.',
    initialResponse: 'Create space, give commands, control the crowd movement, and coordinate contact so bystanders are not caught in the force event',
    forceOption: 'Use only the force reasonably necessary to stop Sierra’s assaultive behavior and prevent additional injuries in the crowd',
    postForceDuty: 'Check on injured bystanders, evaluate Sierra for injury, and preserve witness information from the crowd',
    reportDetail: 'Where the bottles landed, the crowd density, the child knocked down, Sierra’s stance and behavior, and the warnings given',
  },
  {
    id: 'ld152016-focus-41',
    title: 'Waistband Reach After Armed Threat',
    stem: 'During a disturbance investigation, witnesses tell officers Terrence threatened to shoot someone moments earlier. As officers order him to show his hands, Terrence turns, blading his body, and reaches quickly toward his front waistband.',
    initialResponse: 'Use cover, clear commands, and immediate threat assessment based on the armed-threat report and Terrence’s movement',
    forceOption: 'Use the force option that is objectively reasonable to stop an imminent firearm-access threat if Terrence’s movement indicates he is drawing',
    postForceDuty: 'Secure Terrence, locate any weapon, summon medical aid if needed, and isolate witnesses who reported the threat',
    reportDetail: 'The witness report, Terrence’s body positioning, the waistband reach, distances, and what officers perceived at the moment force was used',
  },
  {
    id: 'ld152016-focus-42',
    title: 'Glass Shard in Convenience Store',
    stem: 'An emotionally disturbed man, Omarion, smashes a drink cooler and holds a jagged shard to his own neck while stepping toward a cashier trapped behind the register. Omarion ignores commands, and the cashier is crying while trying to duck behind the counter.',
    initialResponse: 'Use distance, cover, communication, and team positioning while prioritizing the trapped cashier’s safety',
    forceOption: 'Use the objectively reasonable force option that stops the immediate threat to the cashier if Omarion closes distance or attacks',
    postForceDuty: 'Disarm Omarion when safe, get medical help for any injuries, and secure the broken-glass scene for investigation',
    reportDetail: 'The shard, Omarion’s movement toward the cashier, the cashier’s location, command compliance, and the immediacy of the threat',
  },
  {
    id: 'ld152016-focus-43',
    title: 'Vehicle Pins Officer Foot',
    stem: 'While officers try to detain Darien during a stolen-car investigation, Darien shifts into drive. One officer’s foot becomes trapped between the open driver door and a concrete pillar as the vehicle begins moving forward.',
    initialResponse: 'Recognize the immediate risk of serious bodily injury and respond based on the officer trapped by the moving vehicle',
    forceOption: 'Use the objectively reasonable force option needed to stop the imminent threat of death or serious bodily injury created by the moving vehicle',
    postForceDuty: 'Stop the vehicle threat, rescue and medically evaluate the trapped officer, and preserve the scene and vehicle position',
    reportDetail: 'Vehicle movement, officer position, inability to retreat, speed and direction, and why the threat was imminent',
  },
  {
    id: 'ld152016-focus-44',
    title: 'Rear-Cage Prisoner Kicking Windows',
    stem: 'While being transported after an arrest, Naomi begins kicking the patrol vehicle windows, slamming her head backward into the partition, and trying to slip one cuff hand forward despite repeated commands to stop. The nearest safe pullout is several blocks away.',
    initialResponse: 'Drive to the nearest safe stop while monitoring Naomi and coordinating additional units instead of escalating recklessly mid-transport',
    forceOption: 'Use the level of force reasonably necessary to stop Naomi’s destructive and self-injurious behavior once the car can be safely stopped',
    postForceDuty: 'Restrain Naomi safely, request medical evaluation for the head impacts, and document the transport safety risks',
    reportDetail: 'Naomi’s behavior in the cage, the inability to stop immediately, the damage or self-harm risk, and the steps taken once the car safely stopped',
  },
  {
    id: 'ld152016-focus-45',
    title: 'Less-Lethal Window With Sword Suspect',
    stem: 'Officers contact Reggie in a cul-de-sac while he holds a decorative sword at waist level and paces in circles. Reggie is ten yards away, there are no civilians behind officers, and a less-lethal shotgun operator has a clear line of fire while another officer maintains lethal cover.',
    initialResponse: 'Contain the scene, communicate clearly, and coordinate cover and less-lethal roles before Reggie closes distance',
    forceOption: 'Use the objectively reasonable force option that matches Reggie’s immediate threat level, distance, and available less-lethal resources',
    postForceDuty: 'Safely disarm Reggie, handcuff as appropriate, assess for injury, and preserve the less-lethal deployment evidence',
    reportDetail: 'Distance, sword position, cover roles, warnings given, and the factors that made the chosen force option reasonable',
  },
  {
    id: 'ld152016-focus-46',
    title: 'Partner Uses Force on Compliant Subject',
    stem: 'While handcuffing a shoplifting suspect, Officer A sees Officer B strike the suspect again after the suspect is prone, hands visible, and no longer resisting. Several customers are recording, and the suspect is yelling that he cannot breathe.',
    initialResponse: 'Intervene immediately using the least intrusive method necessary to stop the unreasonable force and take control of the scene',
    forceOption: 'Use only the force necessary to safely intervene and stop further unreasonable force, not additional punishment against the suspect',
    postForceDuty: 'Check the suspect’s condition, notify supervision, separate involved officers, and ensure the incident is properly reported',
    reportDetail: 'The suspect’s compliance level, the extra strike, the intervention steps taken, witness/video presence, and the medical response',
  },
  {
    id: 'ld152016-focus-47',
    title: 'Prone Struggle and Medical Distress',
    stem: 'After a foot pursuit, officers take Hector to the ground. Hector continues to tense his arms under his torso but then suddenly stops resisting, gasps, and says he cannot breathe while sweating heavily. One officer notices Hector’s face turning pale.',
    initialResponse: 'Control Hector only as long as necessary, reassess constantly, and shift attention immediately when signs of medical distress appear',
    forceOption: 'Use no more force than necessary to maintain safety once Hector’s resistance changes and possible medical distress becomes apparent',
    postForceDuty: 'Move Hector to a safer recovery position as appropriate, summon medical aid, monitor him continuously, and notify supervision',
    reportDetail: 'How Hector resisted, when the resistance changed, the distress signs observed, and every medical step taken afterward',
  },
  {
    id: 'ld152016-focus-48',
    title: 'Pepper Spray in Protest Pushline',
    stem: 'During a tense protest line, one participant suddenly grabs an officer’s riot shield and yanks forward while others press from behind. Officers have little room to retreat, and pepper spray is available, but uninvolved marchers are immediately adjacent to the contact point.',
    initialResponse: 'Use commands, team movement, and crowd-control positioning while weighing the risk to uninvolved people before using spray',
    forceOption: 'Choose the objectively reasonable force option that stops the assaultive conduct while accounting for the dense crowd and bystander exposure',
    postForceDuty: 'Move affected people to fresh air or decontamination as needed, identify the involved aggressor, and document the crowd conditions',
    reportDetail: 'Crowd density, the grab on the shield, available space, why any chemical option was or was not used, and the impact on bystanders',
  },
  {
    id: 'ld152016-focus-49',
    title: 'Beanbag Decision at Doorway',
    stem: 'Officers respond to a call of a suicidal man, Travis, holding a large kitchen knife inside a doorway. Travis refuses commands to drop it but remains mostly stationary, several feet inside the threshold, while a beanbag shotgun operator and lethal cover are staged outside.',
    initialResponse: 'Slow the event down, keep cover and distance, communicate clearly, and use coordinated roles while Travis remains contained',
    forceOption: 'Use the force option that is objectively reasonable for Travis’s current threat level and movement, accounting for containment and available less-lethal tools',
    postForceDuty: 'Secure the knife, request medical and mental-health follow-up as needed, and preserve the scene and deployment evidence',
    reportDetail: 'Travis’s location, the knife position, warnings, containment, less-lethal availability, and what changed if force was used',
  },
  {
    id: 'ld152016-focus-50',
    title: 'Improvised Weapon in Booking Sally Port',
    stem: 'In the jail sally port, a newly arrested suspect, Monique, slips one hand free, grabs a metal clipboard from a counter, and swings it toward a deputy’s head while backing toward an open vehicle door. Other arrestees and staff are close by.',
    initialResponse: 'Use commands, angles, and coordinated movement to stop the assault while protecting nearby staff and arrestees',
    forceOption: 'Use the objectively reasonable force option necessary to stop Monique’s active assault with the improvised weapon',
    postForceDuty: 'Disarm and secure Monique, check for injuries to everyone involved, and preserve witness and video evidence from the sally port',
    reportDetail: 'How Monique slipped a hand free, the clipboard swing, proximity of others, warnings given, and why the selected force option was necessary',
  },
]

const rawLd152016FocusScenarios: PracticeTestScenario[] = [
  ...arrestSeeds.map(buildArrestScenario),
  ...searchSeeds.map(buildSearchScenario),
  ...forceSeeds.map(buildForceScenario),
]

export const ld152016FocusScenarios: PracticeTestScenario[] = appendTrueFalseFollowUps(
  strengthenScenarioDistractors(rawLd152016FocusScenarios),
)
