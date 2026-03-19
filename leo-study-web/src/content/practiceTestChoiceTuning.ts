type ScenarioLike = {
  questions: Array<{
    choices: string[]
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

export function strengthenScenarioDistractors<T extends ScenarioLike>(scenarios: T[]): T[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    questions: scenario.questions.map((question) => ({
      ...question,
      choices: strengthenChoices(question.choices),
    })),
  }))
}
