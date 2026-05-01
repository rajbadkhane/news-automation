const MPINFO_DIVISIONS = {
  "Bhopal Division": [
    { district: "Bhopal", url: "https://bhopal.mpinfo.org/" },
    { district: "Raisen", url: "https://raisen.mpinfo.org/" },
    { district: "Rajgarh", url: "https://rajgarh.mpinfo.org/" },
    { district: "Sehore", url: "https://sehore.mpinfo.org/" },
    { district: "Vidisha", url: "https://vidisha.mpinfo.org/" },
  ],
  "Chambal Division": [
    { district: "Bhind", url: "https://bhind.mpinfo.org/" },
    { district: "Morena", url: "https://morena.mpinfo.org/" },
    { district: "Sheopur", url: "https://sheopur.mpinfo.org/" },
  ],
  "Gwalior Division": [
    { district: "Ashoknagar", url: "https://ashoknagar.mpinfo.org/" },
    { district: "Datia", url: "https://datia.mpinfo.org/" },
    { district: "Guna", url: "https://guna.mpinfo.org/" },
    { district: "Gwalior", url: "https://gwalior.mpinfo.org/" },
    { district: "Shivpuri", url: "https://shivpuri.mpinfo.org/" },
  ],
  "Indore Division": [
    { district: "Alirajpur", url: "https://alirajpur.mpinfo.org/" },
    { district: "Barwani", url: "https://barwani.mpinfo.org/" },
    { district: "Burhanpur", url: "https://burhanpur.mpinfo.org/" },
    { district: "Dhar", url: "https://dhar.mpinfo.org/" },
    { district: "Indore", url: "https://indore.mpinfo.org/" },
    { district: "Jhabua", url: "https://jhabua.mpinfo.org/" },
    { district: "Khandwa", url: "https://khandwa.mpinfo.org/" },
    { district: "Khargone", url: "https://khargone.mpinfo.org/" },
  ],
  "Jabalpur Division": [
    { district: "Balaghat", url: "https://balaghat.mpinfo.org/" },
    { district: "Chhindwara", url: "https://chhindwara.mpinfo.org/" },
    { district: "Jabalpur", url: "https://jabalpur.mpinfo.org/" },
    { district: "Katni", url: "https://katni.mpinfo.org/" },
    { district: "Mandla", url: "https://mandla.mpinfo.org/" },
    { district: "Narsinghpur", url: "https://narsinghpur.mpinfo.org/" },
    { district: "Seoni", url: "https://seoni.mpinfo.org/" },
  ],
  "Narmadapuram Division": [
    { district: "Betul", url: "https://betul.mpinfo.org/" },
    { district: "Harda", url: "https://harda.mpinfo.org/" },
    { district: "Narmadapuram", url: "https://hoshangabad.mpinfo.org/" },
  ],
  "Rewa Division": [
    { district: "Mauganj", url: "https://mauganj.mpinfo.org/" },
    { district: "Rewa", url: "https://rewa.mpinfo.org/" },
    { district: "Satna", url: "https://satna.mpinfo.org/" },
    { district: "Sidhi", url: "https://sidhi.mpinfo.org/" },
    { district: "Singrauli", url: "https://singrauli.mpinfo.org/" },
  ],
  "Sagar Division": [
    { district: "Chhatarpur", url: "https://chhatarpur.mpinfo.org/" },
    { district: "Damoh", url: "https://damoh.mpinfo.org/" },
    { district: "Niwari", url: "https://niwari.mpinfo.org/" },
    { district: "Panna", url: "https://panna.mpinfo.org/" },
    { district: "Sagar", url: "https://sagar.mpinfo.org/" },
    { district: "Tikamgarh", url: "https://tikamgarh.mpinfo.org/" },
  ],
  "Shahdol Division": [
    { district: "Anuppur", url: "https://anuppur.mpinfo.org/" },
    { district: "Dindori", url: "https://dindori.mpinfo.org/" },
    { district: "Shahdol", url: "https://shahdol.mpinfo.org/" },
    { district: "Umaria", url: "https://umaria.mpinfo.org/" },
  ],
  "Ujjain Division": [
    { district: "Agar Malwa", url: "https://agarmalwa.mpinfo.org/" },
    { district: "Dewas", url: "https://dewas.mpinfo.org/" },
    { district: "Mandsaur", url: "https://mandsaur.mpinfo.org/" },
    { district: "Neemuch", url: "https://neemuch.mpinfo.org/" },
    { district: "Ratlam", url: "https://ratlam.mpinfo.org/" },
    { district: "Shajapur", url: "https://shajapur.mpinfo.org/" },
    { district: "Ujjain", url: "https://ujjain.mpinfo.org/" },
  ],
  "Vindhya Division": [
    { district: "Maihar", url: "https://maihar.mpinfo.org/" },
  ],
};

function getMpInfoDistricts() {
  return Object.entries(MPINFO_DIVISIONS).flatMap(([division, districts]) =>
    districts.map((district) => ({
      ...district,
      division,
      slug: district.url.replace(/^https?:\/\//, "").replace(/\.mpinfo\.org\/?$/i, "").toLowerCase(),
      subdomain: new URL(district.url).hostname,
    }))
  );
}

module.exports = {
  MPINFO_DIVISIONS,
  getMpInfoDistricts,
};
