function dedupeRefs(refs: string[]) {
  return Array.from(new Set(refs.filter(Boolean)))
}

function parseExplicitTtsRefs(objective: string) {
  const match = objective.match(/^TTS\s+(.+?)(?:\s+—|$)/i)
  if (!match) return []
  return dedupeRefs(
    match[1]
      .split('/')
      .map((part) => part.trim())
      .filter((part) => /^\d+\.\d+[A-Z]$/i.test(part)),
  )
}

function resolveLd5Refs(objective: string) {
  if (/criminal vs civil/i.test(objective)) return ['5.2B']
  if (/attempt|specific intent/i.test(objective)) return ['5.3C', '5.3D']
  if (/accessory|aider|abet|principal|lookout|parties to a crime/i.test(objective)) return ['5.4B']
  return []
}

function resolveLd6Refs(objective: string) {
  if (/arson|fire-scene/i.test(objective)) return ['6.2A', '6.2B']
  if (/trespass/i.test(objective)) return ['6.3A', '6.3B']
  if (/report writing|report detail|evidence collection|evidence preservation/i.test(objective)) return ['6.1B', '6.1D']
  if (/burglary|theft|vehicle|trailer|defrauding|innkeeper|shoplifting|burglary tools|altered|serial|receiving stolen|forgery|embezzlement|false pretenses|fraudulent obtaining/i.test(objective)) {
    return ['6.1A']
  }
  return []
}

function resolveLd7Refs(objective: string) {
  if (/elder|dependent adult/i.test(objective)) return ['7.1A', '7.1B']
  if (/battery|assault|injury/i.test(objective)) return ['7.1A', '7.1B']
  if (/kidnapping|false imprisonment|movement|force or fear|restraint/i.test(objective)) return ['7.2A']
  if (/robbery|carjacking/i.test(objective)) return ['7.3A', '7.3B']
  if (/death investigation|scene documentation/i.test(objective)) return ['7.5A']
  return []
}

function resolveLd8Refs(objective: string) {
  if (/obstruction|public way|public obstruction/i.test(objective)) return ['8.2A', '8.2B']
  if (/classification/i.test(objective)) return ['8.1B', '8.2B']
  if (/indecent exposure|invasion of privacy|prostitution|solicitation|loitering|public intoxication|lewd/i.test(objective)) {
    return ['8.1A', '8.1B']
  }
  return []
}

function resolveLd9Refs(objective: string) {
  if (/mandated reporter/i.test(objective)) return ['9.2A']
  if (/confidentiality/i.test(objective)) return ['9.2D']
  if (/documentation|evidence documentation/i.test(objective)) return ['9.2B', '9.2C']
  if (/warrantless entry|emergency entry|emergency child protection|immediate child safety/i.test(objective)) return ['9.3A', '9.3B']
  if (/abuse indicators|neglect indicators/i.test(objective)) return ['9.1A']
  return []
}

function resolveLd10Refs(objective: string) {
  if (/registration/i.test(objective)) return ['10.4A', '10.4B']
  if (/evidence preservation|victim-centered reporting|documentation/i.test(objective)) return ['10.3C', '10.3D', '10.3E', '10.3F']
  if (/victim interaction|victim-centered|interview tone/i.test(objective)) return ['10.2A', '10.2B', '10.3A', '10.3B', '10.3F']
  if (/sexual battery|rape|consent and classification|indecent exposure/i.test(objective)) return ['10.1A', '10.1B']
  return []
}

function resolveLd15Refs(objective: string) {
  if (/consensual encounter/i.test(objective)) return ['15.2A', '15.2B', '15.2C']
  if (/detention|reasonable suspicion/i.test(objective)) return ['15.3A', '15.3B', '15.3C']
  if (/frisk/i.test(objective)) return ['15.3D', '15.3E']
  if (/private person arrest|citizen arrest|officer role in citizen arrest/i.test(objective)) return ['15.4I']
  if (/probable cause|arrest standard/i.test(objective)) return ['15.4A', '15.4B', '15.4C', '15.4E', '15.4F', '15.4G']
  if (/miranda|custodial interrogation/i.test(objective)) return ['15.5B', '15.5C', '15.5E', '15.5F']
  if (/volunteered statements/i.test(objective)) return ['15.5F', '15.6A', '15.6B']
  if (/interview|interrogation|admission|confession/i.test(objective)) return ['15.6A', '15.6B', '15.6C', '15.6D']
  return []
}

function resolveLd16Refs(objective: string) {
  if (/standing|expectation of privacy|abandon/i.test(objective)) return ['16.1B', '16.1C']
  if (/vehicle|motor-vehicle|console|container searches?|container.*vehicle/i.test(objective)) return ['16.1D', '16.4A']
  if (/inventory/i.test(objective)) return ['16.4B']
  if (/warrant search|warrant scope|nexus|securing a scene/i.test(objective)) return ['16.2A', '16.2B', '16.2D', '16.2E']
  if (/plain view/i.test(objective)) return ['16.3A', '16.3B']
  if (/emergency|protective sweep/i.test(objective)) return ['16.3C', '16.3D']
  if (/consent|common authority|exclusive areas/i.test(objective)) return ['16.3D']
  if (/pat search|frisk/i.test(objective)) return ['16.3D']
  if (/search incident/i.test(objective)) return ['16.3D', '16.4A']
  if (/search condition/i.test(objective)) return ['16.3D']
  if (/digital/i.test(objective)) return ['16.1E', '16.2A', '16.3D']
  return []
}

function resolveLd20Refs(objective: string) {
  if (/deescalation/i.test(objective)) return ['20.2A', '20.2D', '20.2E']
  if (/deadly force|imminent deadly threat|immediate threat/i.test(objective)) return ['20.4A', '20.4B', '20.4C']
  if (/less-lethal/i.test(objective)) return ['20.3C', '20.4C']
  if (/medical|post-force|report|documentation/i.test(objective)) return ['20.5A']
  if (/objective reasonableness|lawfulness of force|use of force during resistance/i.test(objective)) {
    return ['20.1A', '20.1B', '20.1C', '20.3C']
  }
  if (/intervention/i.test(objective)) return ['20.7C', '20.7D', '20.7E']
  return []
}

function resolveLd39Refs(objective: string) {
  if (/court-order|witness intimidation|victim intimidation|retaliation/i.test(objective)) return ['39.1A', '39.1B']
  if (/obstruction by force|resistance by force/i.test(objective)) return ['39.2A', '39.2B']
  if (/false identifying|false identity|false information|false emergency|false bomb/i.test(objective)) return ['39.3A', '39.3B']
  if (/report writing/i.test(objective)) return ['39.1A', '39.2A', '39.3A']
  return []
}

export function resolvePracticeTestTtsRefs(ldNumber: string, objective: string) {
  const explicitRefs = parseExplicitTtsRefs(objective)
  if (explicitRefs.length) return explicitRefs

  const normalizedObjective = objective.trim()
  switch (ldNumber) {
    case '5':
      return dedupeRefs(resolveLd5Refs(normalizedObjective))
    case '6':
      return dedupeRefs(resolveLd6Refs(normalizedObjective))
    case '7':
      return dedupeRefs(resolveLd7Refs(normalizedObjective))
    case '8':
      return dedupeRefs(resolveLd8Refs(normalizedObjective))
    case '9':
      return dedupeRefs(resolveLd9Refs(normalizedObjective))
    case '10':
      return dedupeRefs(resolveLd10Refs(normalizedObjective))
    case '15':
      return dedupeRefs(resolveLd15Refs(normalizedObjective))
    case '16':
      return dedupeRefs(resolveLd16Refs(normalizedObjective))
    case '20':
      return dedupeRefs(resolveLd20Refs(normalizedObjective))
    case '39':
      return dedupeRefs(resolveLd39Refs(normalizedObjective))
    default:
      return []
  }
}
