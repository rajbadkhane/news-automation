export function unicodeToKrutidev(unicodeSubstring: string): string {
  const array_one = [
    "‘", "’", "“", "”", "(", ")", "{", "}", "=", "।", "?", "-", "µ", "॰", ",", ".", "् ",
    "०", "१", "२", "३", "४", "५", "६", "७", "८", "९", "x",
    "फ़्", "क़", "ख़", "ग़", "ज़्", "ज़", "ड़", "ढ़", "फ़", "य़", "ऱ", "ऩ",
    "त्त्", "त्त", "क्त", "दृ", "कृ", "ह्न", "ह्य", "हृ", "ह्म", "ह्र", "ह्", "द्द",
    "क्ष्", "क्ष", "त्र्", "त्र", "ज्ञ", "छ्य", "ट्य", "ठ्य", "ड्य", "ढ्य", "द्य", "द्व",
    "श्र", "ट्र", "ड्र", "ढ्र", "छ्र", "क्र", "फ्र", "द्र", "प्र", "ग्र", "रु", "रू",
    "्र", "ओ", "औ", "आ", "अ", "ई", "इ", "उ", "ऊ", "ऐ", "ए", "ऋ",
    "क्", "क", "क्क", "ख्", "ख", "ग्", "ग", "घ्", "घ", "ङ",
    "चै", "च्", "च", "छ", "ज्", "ज", "झ्", "झ", "ञ", "ट्ट",
    "ट्ठ", "ट", "ठ", "ड्ड", "ड्ढ", "ड", "ढ", "ण्", "ण",
    "त्", "त", "थ्", "थ", "द्ध", "द", "ध्", "ध", "न्", "न",
    "प्", "प", "फ्", "फ", "ब्", "ब", "भ्", "भ", "म्", "म", "य्", "य",
    "र", "ल्", "ल", "ळ", "व्", "व", "श्", "श", "ष्", "ष", "स्", "स", "ह",
    "ऑ", "ॉ", "ो", "ौ", "ा", "ी", "ु", "ू", "ृ", "े", "ै",
    "ं", "ँ", "ः", "ॅ", "ऽ", "् ", "्"
  ];

  const array_two = [
    "^", "*", "Þ", "ß", "¼", "½", "¿", "À", "¾", "A", "\\", "&", "&", "Œ", "]", "-", "~ ",
    "å", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Û",
    "¶+", "d+", "[k+", "x+", "T+", "t+", "M+", "<+", "Q+", ";+", "j+", "u+",
    "Ù", "Ùk", "Dr", "–", "—", "à", "á", "â", "ã", "ºz", "º", "í",
    "{", "{k", "«", "=", "K", "Nî", "Vî", "Bî", "Mî", "<î", "|", "}",
    "J", "Vª", "Mª", "<ªª", "Nª", "Ø", "Ý", "æ", "ç", "xz", "#", ":",
    "z", "vks", "vkS", "vk", "v", "bZ", "b", "m", "Å", ",s", ",", "_",
    "D", "d", "ô", "[", "[k", "X", "x", "?", "?k", "³",
    "pkS", "P", "p", "N", "T", "t", "÷", ">", "¥", "ê",
    "ë", "V", "B", "ì", "ï", "M", "<", ".", ".k",
    "R", "r", "F", "Fk", ")", "n", "/", "/k", "U", "u",
    "I", "i", "¶", "Q", "C", "c", "H", "Hk", "E", "e", "¸", ";",
    "j", "Y", "y", "G", "O", "o", "'", "'k", "\"", "\"k", "L", "l", "g",
    "v‚", "‚", "ks", "kS", "k", "h", "q", "w", "`", "s", "S",
    "a", "¡", "%", "W", "·", "~ ", "~"
  ];

  let modifiedSubstring = unicodeSubstring;

  // Single Quote specific rules from script
  let positionOfQuote = modifiedSubstring.indexOf("'");
  while (positionOfQuote >= 0) {
    modifiedSubstring = modifiedSubstring.replace("'", "^");
    let nextQuote = modifiedSubstring.indexOf("'");
    if (nextQuote >= 0) {
      modifiedSubstring = modifiedSubstring.replace("'", "*");
    }
    positionOfQuote = modifiedSubstring.indexOf("'");
  }

  let positionOfDQuote = modifiedSubstring.indexOf("\"");
  while (positionOfDQuote >= 0) {
    modifiedSubstring = modifiedSubstring.replace("\"", "ß");
    let nextDQuote = modifiedSubstring.indexOf("\"");
    if (nextDQuote >= 0) {
      modifiedSubstring = modifiedSubstring.replace("\"", "Þ");
    }
    positionOfDQuote = modifiedSubstring.indexOf("\"");
  }

  const replacements: Record<string, string> = {
    "क़": "क़",
    "ख़": "ख़",
    "ग़": "ग़",
    "ज़": "ज़",
    "ड़": "ड़",
    "ढ़": "ढ़",
    "ऩ": "ऩ",
    "फ़": "फ़",
    "य़": "य़",
    "ऱ": "ऱ"
  };
  Object.entries(replacements).forEach(([key, val]) => {
    modifiedSubstring = modifiedSubstring.split(key).join(val);
  });

  // Handle character positioning for 'f' (chhoti i matra)
  let positionOfF = modifiedSubstring.indexOf("ि");
  while (positionOfF !== -1) {
    let characterLeftToF = modifiedSubstring.charAt(positionOfF - 1);
    modifiedSubstring = modifiedSubstring.slice(0, positionOfF - 1) + "f" + characterLeftToF + modifiedSubstring.slice(positionOfF + 1);

    positionOfF = positionOfF - 1;
    while ((positionOfF !== 0) && (modifiedSubstring.charAt(positionOfF - 1) === '्')) {
      let stringToBeReplaced = modifiedSubstring.charAt(positionOfF - 2) + "्";
      // We must specifically swap this stringToBeReplaced and 'f'
      let targetSlice = stringToBeReplaced + "f";
      let replacementSlice = "f" + stringToBeReplaced;
      // doing replace will replace the first occurence. that should be fine because we only moved it one position prior manually.
      // Actually it's safer to slice manually.
      modifiedSubstring = modifiedSubstring.slice(0, positionOfF - 2) + replacementSlice + modifiedSubstring.slice(positionOfF + 1);
      positionOfF = positionOfF - 2;
    }
    positionOfF = modifiedSubstring.indexOf("ि", positionOfF + 1);
  }

  // Handle Reph (र्)
  const setOfMatras = "ािीुूृेैोौं:ँॅ";
  modifiedSubstring += "  ";
  let positionOfHalfR = modifiedSubstring.indexOf("र्");
  while (positionOfHalfR > 0) {
    let probablePositionOfZ = positionOfHalfR + 2;
    let characterRightToProbablePositionOfZ = modifiedSubstring.charAt(probablePositionOfZ);

    while (setOfMatras.indexOf(characterRightToProbablePositionOfZ) !== -1) {
      probablePositionOfZ = probablePositionOfZ + 1;
      characterRightToProbablePositionOfZ = modifiedSubstring.charAt(probablePositionOfZ);
    }

    let stringToBeReplaced = modifiedSubstring.substring(positionOfHalfR + 2, probablePositionOfZ);
    modifiedSubstring = modifiedSubstring.slice(0, positionOfHalfR) + stringToBeReplaced + "Z" + modifiedSubstring.slice(probablePositionOfZ);
    positionOfHalfR = modifiedSubstring.indexOf("र्");
  }

  modifiedSubstring = modifiedSubstring.substring(0, modifiedSubstring.length - 2);

  for (let i = 0; i < array_one.length; i++) {
    modifiedSubstring = modifiedSubstring.split(array_one[i]).join(array_two[i]);
  }

  return modifiedSubstring;
}
