type ScenarioLike = {
  questions: Array<{
    id: string
    ldNumber: string
    objective: string
    prompt: string
    choices: string[]
    correctIndex: number
  }>
}

const exactChoiceRewrites = new Map<string, string>([
  [
    'Only the estimated retail price of the merchandise',
    'The retail value alone, without documenting serial numbers, entry method, or where the property was recovered',
  ],
  [
    'Only the responding officers’ opinions about Maria’s honesty',
    'The officers’ belief that Maria was lying, without tying the report to the broken entry point and recovered property',
  ],
  [
    'Only the final booking charge and the court date',
    'The final booking charge and court date once transport is arranged, without giving the statutory arrest advisement at the scene',
  ],
  [
    'Only the fact that the suspect can talk to a judge later',
    'The fact that the suspect will later see a judge, without explaining the current arrest authority or cause',
  ],
  [
    'Only the identity of every witness who accused the suspect',
    'A full witness list and all underlying evidence, even if officers do not communicate the required arrest information at the time of custody',
  ],
  [
    'Whenever any officer speaks to any citizen during a field contact',
    'During any extended field detention, even when officers are not yet questioning a person in custody for incriminating responses',
  ],
  [
    'Only the tow truck driver',
    'The driver of the car, even without any ownership or possession facts connecting that person to the backpack',
  ],
  [
    'Only the arresting officer',
    'Any occupant of the vehicle, simply because the backpack was found in the passenger compartment',
  ],
  [
    'They must always impound the car and wait 30 days before any search',
    'They should rely on a later impound and inventory process rather than the probable-cause search authority that already exists at the scene',
  ],
  [
    'They may never search a container found in a vehicle',
    'They may search the vehicle generally, but closed containers still require a separate warrant even when they could hold the object of the search',
  ],
  [
    'Deadly force is never reasonable unless the suspect has already stabbed someone',
    'Deadly force becomes reasonable only after the suspect closes distance enough that lesser options are no longer available, regardless of the current threat cues',
  ],
  [
    'Deadly force is automatically required whenever a knife is present',
    'The mere presence of a knife makes deadly force appropriate even if distance, cover, and containment still reduce the immediate threat',
  ],
  [
    'Only the final technique used, because earlier tactics are irrelevant',
    'The report can focus mainly on the final force option if body-camera footage captures the earlier tactics and warnings',
  ],
  [
    'Only the suspect’s criminal history',
    'Mainly the suspect’s prior record or reputation, even if the immediate threat cues on scene are not clearly articulated',
  ],
  [
    'Only the passenger, not officers, may touch the console',
    'Officers may secure the console area for safety, but need a separate legal basis before opening it to look for evidence',
  ],
  [
    'Only the suspect’s opinion that the stay was temporary',
    'The length of the stay alone, without facts showing intent to avoid payment or any fraudulent representation',
  ],
  [
    'Only the property-crime evidence found inside the room',
    'The fact that property was found inside the room, without evidence about payment intent or deception used to obtain the room',
  ],
  [
    'No crime analysis is possible because the property never left the yard',
    'The conduct is limited to trespass or vandalism unless the suspect successfully removes the property from the premises',
  ],
  [
    'It is irrelevant because hotel cases never involve fraudulent representation',
    'It matters only if hotel staff already completed a civil demand or checkout notice before officers arrived',
  ],
  [
    'Only the estimated replacement cost of the bathrobes',
    'The replacement cost and room number alone, without the guest conduct showing fraudulent intent or evasion',
  ],
  [
    'Whenever any subject has any object in hand, regardless of threat level or background',
    'Whenever a subject is armed and ignores commands, even if distance, cover, backdrop, and other force options still require assessment',
  ],
  [
    'Deadly force is never reasonable during a crisis-intervention call',
    'Because it is a crisis-intervention call, officers must exhaust every less-lethal option before deadly force can even be considered',
  ],
  [
    'Because anyone present near a courthouse can always be detained',
    'Because officers may detain anyone who is close to a reported threat location until they rule that person out',
  ],
  [
    'Miranda never applies in witness-intimidation cases',
    'Because the offense involves intimidation rather than a traditional violent crime, Miranda can wait until officers finish the first round of questions',
  ],
  [
    'Only the court-order violation can be discussed without any advisement',
    'Questions about the court-order violation can proceed first, and Miranda can be delayed until officers shift to the threat investigation',
  ],
  [
    'No role because he never entered the house',
    'At most an accessory-after-the-fact theory unless he physically handled property after the burglary was complete',
  ],
  [
    'It is purely criminal and civil damages can never exist',
    'The victim must choose either criminal prosecution or civil damages because the same facts cannot support both',
  ],
  [
    'Only the total amount of the refund cards',
    'The total dollar amount and the cashier’s job status, without tying specific transactions or cards to the suspect',
  ],
  [
    'Only the cashier’s guess about how long the scheme had been happening',
    'The cashier’s impression that the scheme had been going on for a while, even without transaction records or card data',
  ],
  [
    'The patrol happened after dark',
    'The patrol officer had prior experience with the suspect or property type from unrelated incidents in the area',
  ],
  [
    'Only the mother’s later explanation',
    'The mother’s explanation and overall cooperativeness, without documenting the child-safety facts officers observed',
  ],
  [
    'Nothing until medical personnel are present',
    'Initial documentation can wait until medical staff confirm whether the injuries or neglect indicators are significant',
  ],
  [
    'Promise the report will never be disclosed to anyone',
    'Assure the reporting party that the statement will remain completely off the record unless an arrest is made',
  ],
  [
    'Only the witness being nervous',
    'The witness’s nervousness and the suspect’s general reputation, without direct threat facts tied to this event',
  ],
  [
    'Only the landlord can consent',
    'The landlord and any guest physically present can jointly authorize a full search of the residence',
  ],
  [
    'Locked rooms can never be searched',
    'A locked room always requires a warrant, even if a co-occupant actually shares authority over that room',
  ],
  [
    'Bedrooms are never searchable under any circumstances',
    'Bedrooms require separate proof that contraband is inside before officers may search them, regardless of any shared authority facts',
  ],
  [
    'Whenever any edged weapon is present, regardless of distance or backdrop',
    'Whenever an edged weapon is present and a less-lethal option is available, even if distance and backdrop make deployment tactically unsound',
  ],
  [
    'Deadly force is never allowed in an apartment building',
    'In a crowded apartment setting, officers must rule out every other option before deadly force can be considered, no matter how immediate the threat becomes',
  ],
  [
    'Only the final weapon or tactic used',
    'Primarily the final weapon choice and resulting injury, because earlier tactics and warnings can be left to the video review',
  ],
  [
    'Nothing until detectives finish the case',
    'Only a short booking summary is needed until investigators decide whether a detailed force supplement is necessary',
  ],
  [
    'Only the officers’ frustration at the false call',
    'The inconvenience and agency cost caused by the false call, even if intent and public disruption are not clearly documented',
  ],
  [
    'Only the driver looking nervous',
    'The driver’s nervousness plus the area’s narcotics history, even without stronger scene-based search facts',
  ],
  [
    'Only the odor of marijuana with no other facts',
    'The odor together with the driver’s prior drug history, even without stronger current observations inside the vehicle',
  ],
  [
    'They can never search a backpack in a vehicle',
    'They may search only the passenger compartment itself and would still need a separate warrant for any backpack found inside, regardless of the doctrine used',
  ],
  [
    'Deadly force is never reasonable when a suspect is trying to leave',
    'Deadly force requires proof the suspect already inflicted serious injury, even if the suspect is turning toward officers with a weapon',
  ],
  [
    'Only the final force option used',
    'The final force option and resulting injury, while leaving most of the pre-force tactics and warnings to later video review',
  ],
  [
    'Nothing until detectives request it',
    'A brief arrest log entry is enough initially; the full force articulation can wait unless detectives ask for a supplement',
  ],
])

function strengthenChoices(choices: string[]) {
  return choices.map((choice) => exactChoiceRewrites.get(choice) ?? choice)
}

type PromptCategory =
  | 'offense'
  | 'role'
  | 'mental_state'
  | 'supporting_fact'
  | 'report'
  | 'response'
  | 'level'
  | 'search'
  | 'miranda'
  | 'force'
  | 'general'

const curatedDistractorBanks: Record<string, Partial<Record<PromptCategory, string[]>>> = {
  '5': {
    offense: [
      'Conspiracy based on agreement plus overt acts',
      'Accessory after the fact',
      'Attempt liability based on a direct but ineffectual act',
      'Principal liability through aiding and abetting',
    ],
    role: [
      'Accessory after the fact',
      'Conspiracy based on agreement plus overt acts',
      'A witness with no criminal exposure',
      'A civil plaintiff only',
    ],
  },
  '6': {
    offense: [
      'Receiving stolen property',
      'Possession of burglary tools',
      'Possession of or receiving property with altered serial numbers',
      'Defrauding an innkeeper',
      'Theft by false pretenses',
      'Trespass with vandalism exposure',
      'Shoplifting',
    ],
    level: ['Straight felonies only', 'A wobbler that can be filed either way', 'Misdemeanors', 'Infractions only'],
  },
  '7': {
    offense: [
      'Battery or other force-based crime-against-the-person analysis',
      'Assault with a deadly weapon',
      'False imprisonment',
      'Criminal threats',
      'Voluntary manslaughter',
      'Murder',
    ],
    force: [
      'Containment and de-escalation while reassessing threat cues',
      'Less-lethal force only if it remains objectively reasonable under the changing threat facts',
      'Deadly force only if the suspect presents an imminent threat of death or serious bodily injury',
      'Immediate medical care, scene control, and detailed force articulation after the event',
    ],
  },
  '8': {
    offense: [
      'Forgery',
      'False report of an emergency',
      'Defrauding an innkeeper',
      'Prostitution or solicitation for prostitution',
      'Trespass or prowling exposure',
      'False personation or obstruction-related exposure',
    ],
    level: ['Straight felonies only', 'A wobbler that can be filed either way', 'Misdemeanors', 'Infractions only'],
  },
  '9': {
    offense: [
      'Child endangerment',
      'Child neglect',
      'Mandated-reporter failure analysis',
      'Immediate child-safety / exigency analysis',
      'Custodial or caregiver neglect theory',
    ],
    response: [
      'Take immediate action to protect any child who may still be at risk and preserve the first disclosure accurately',
      'Stabilize the child, assess medical needs, and document exact statements and scene conditions',
      'Treat the call as a child-protection response first, not only a delayed report for detectives',
    ],
  },
  '10': {
    offense: [
      'Sexual battery or unlawful sexual touching',
      'Rape or unlawful sexual intercourse exposure',
      'Lewd conduct or child-molestation analysis',
      'Sex-offender registration violation',
      'Victim-centered sex-crime first-response issue',
    ],
    response: [
      'Use a calm, victim-centered approach while preserving the initial disclosure and immediate safety needs',
      'Separate the victim from the suspect, assess medical or forensic needs, and document the first account carefully',
      'Avoid a blame-focused interview and preserve support resources, witness information, and disclosure details',
    ],
  },
  '15': {
    offense: [
      'A consensual encounter',
      'A detention supported by specific, articulable facts',
      'A warrantless arrest supported by probable cause',
      'Custodial interrogation requiring Miranda',
    ],
    miranda: [
      'Miranda is required before custodial interrogation designed to elicit incriminating responses',
      'Questions may stay limited to public-safety or booking issues, but incriminating custodial interrogation still requires Miranda',
      'Custody alone is not enough; Miranda attaches when custody and interrogation are both present',
    ],
  },
  '16': {
    search: [
      'Search based on valid consent with actual or apparent authority',
      'Probable-cause vehicle search that includes containers capable of holding the object sought',
      'Search condition search tied to the probation or parole terms',
      'Plain-view seizure after lawful access to the location',
      'Protective pat search for weapons based on specific officer-safety facts',
    ],
  },
  '20': {
    force: [
      'Containment, cover, communication, and de-escalation while reassessing the threat',
      'A less-lethal option only if it remains objectively reasonable under the totality of the circumstances',
      'Deadly force only if the suspect presents an imminent threat of death or serious bodily injury',
      'Immediate intervention, medical care, and reporting duties after unreasonable or reportable force',
    ],
    response: [
      'Slow the event down when feasible, use cover and distance, and reassess threat cues before escalating force',
      'Choose the force option that is objectively reasonable now, not the harshest option theoretically available',
      'After force, secure the scene, request medical aid, and document the threat facts and warnings clearly',
    ],
  },
  '39': {
    offense: [
      'Witness intimidation or retaliation-related threats',
      'Violation of a court order',
      'False bomb or false emergency report',
      'Accessory after the fact',
      'Perjury or false-statement-related exposure',
    ],
    miranda: [
      'Custodial questioning about witness threats still requires Miranda before incriminating interrogation',
      'Officers may separate safety questions from the later evidentiary interview, but Miranda still governs custodial interrogation',
      'Court-order or intimidation cases do not create a blanket Miranda exception',
    ],
  },
}

const weakDistractorPatterns = [
  /\bpublic intoxication\b/i,
  /\bdisturbing the peace\b/i,
  /\bindecent exposure\b/i,
  /\barson\b/i,
  /\bkidnapping\b/i,
  /\bcarjacking\b/i,
  /\bloitering\b/i,
  /\bpublic nuisance\b/i,
  /\bfailure to appear\b/i,
  /\bcivil standby\b/i,
  /\bvoluntary witness\b/i,
  /\bconfidential informant\b/i,
  /\bmandatory child-abuse report\b/i,
]

function normalizeText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function compareKey(text: string) {
  return normalizeText(text)
    .replace(/\b(a|an|the)\b/g, '')
    .replace(/\bonly\b/g, '')
    .replace(/[.?!]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyPrompt(prompt: string, objective: string, ldNumber: string): PromptCategory {
  const text = `${prompt} ${objective}`.toLowerCase()

  if (/\bmiranda\b|\bcustodial interrogation\b|\binterrogat/i.test(text)) return 'miranda'
  if (/\bforce\b|\bless-lethal\b|\bdeadly\b|\bde-?escal/i.test(text)) return 'force'
  if (/\bsearch\b|\bpat search\b|\bplain view\b|\bwarrant\b|\bconsent\b|\bcontainer\b|\bprobation\b|\bparole\b/.test(text)) return 'search'
  if (/\bwhat level\b|\bfelony\b|\bmisdemeanor\b|\binfraction\b/.test(text)) return 'level'
  if (/\bmental state\b|\bintent\b/.test(text)) return 'mental_state'
  if (/\bwhich fact\b|\bwhat fact\b|\bmost directly supports\b|\bmost strongly supports\b|\bbest supports\b|\bkey fact\b/.test(text)) return 'supporting_fact'
  if (/\breport\b|\bdocument\b|\bdocumentation\b|\badvisement\b|\bwhat should be included\b/.test(text)) return 'report'
  if (/\bfirst-response\b|\bfirst response\b|\bbest first\b|\bbest initial\b|\bbest response\b|\bshould officers do first\b|\bbest approach\b|\bbest reflects\b|\bwhat is the best first-response approach\b/.test(text)) return 'response'
  if (/\brole best fits\b|\baiding and abetting\b|\bprincipal\b|\baccessory\b|\bconspiracy\b/.test(text)) return 'role'
  if (/\boffense\b|\bcrime\b|\bcharge\b|\btheory\b|\bviolation\b|\bclassification\b/.test(text)) return 'offense'
  if (ldNumber === '20') return 'force'
  if (ldNumber === '16') return 'search'
  if (ldNumber === '15') return 'miranda'
  return 'general'
}

function isWeakDistractor(choice: string, category: PromptCategory) {
  if (weakDistractorPatterns.some((pattern) => pattern.test(choice))) return true
  if (category === 'offense' || category === 'role' || category === 'level') {
    return choice.length < 40 || !/[.?!]/.test(choice)
  }
  return false
}

function replaceWeakDistractors<T extends ScenarioLike>(scenarios: T[]) {
  return scenarios.map((scenario) => ({
    ...scenario,
    questions: scenario.questions.map((question) => {
      const category = classifyPrompt(question.prompt, question.objective, question.ldNumber)
      const rewrittenChoices = strengthenChoices(question.choices)
      const correctChoice = rewrittenChoices[question.correctIndex]
      const allowCuratedReplacement =
        category === 'offense' || ((category === 'role' || category === 'level') && correctChoice.length <= 48)
      const usedChoices = new Set(rewrittenChoices.map((choice) => compareKey(choice)))
      const curatedCandidates = (curatedDistractorBanks[question.ldNumber]?.[category] ?? []).filter(
        (candidate) =>
          compareKey(candidate) !== compareKey(rewrittenChoices[question.correctIndex]) && !usedChoices.has(compareKey(candidate)),
      )
      let curatedIndex = 0
      const nextReplacement = () => {
        while (curatedIndex < curatedCandidates.length) {
          const candidate = curatedCandidates[curatedIndex]
          curatedIndex += 1
          const key = compareKey(candidate)
          if (usedChoices.has(key)) continue
          usedChoices.add(key)
          return candidate
        }
        return null
      }

      const choices = rewrittenChoices.map((choice, index) => {
        if (index === question.correctIndex) return choice
        if (!allowCuratedReplacement || !isWeakDistractor(choice, category)) return choice

        const replacement = nextReplacement()
        return replacement ?? choice
      })

      return {
        ...question,
        choices,
      }
    }),
  }))
}

export function strengthenScenarioDistractors<T extends ScenarioLike>(scenarios: T[]): T[] {
  return replaceWeakDistractors(scenarios)
}
