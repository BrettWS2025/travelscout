export type InsuranceRow = {
  id: string;
  provider: string;
  basic: number | null;
  comprehensive: number | null;
  multiTrip: number | null;
  other?: string | null;
  url?: string | null;
};

export type InsuranceSlide = { title: string; basicLabel: string; rows: InsuranceRow[] };
export const INSURANCE_SLIDES: InsuranceSlide[] = [
  {
    title: "Family of 4 to Fiji for a week",
    basicLabel: "Basic",
    rows: [
      {"id": "ins-allianz", "provider": "Allianz", "basic": 108.28, "comprehensive": 188.18, "multiTrip": 1005.17, "other": null, "url": "https://www.allianztravel.co.nz/"},
      {"id": "ins-tower", "provider": "Tower", "basic": 102.0, "comprehensive": 140.0, "multiTrip": 770.0, "other": null, "url": "https://www.tower.co.nz/travelinsurance/"},
      {"id": "ins-southern-cross", "provider": "Southern Cross", "basic": 67.72, "comprehensive": 156.06, "multiTrip": 570.9, "other": null, "url": "https://www.scti.co.nz/"},
      {"id": "ins-zoom-insurance", "provider": "Zoom Insurance", "basic": 74.19, "comprehensive": 79.76, "multiTrip": 593.81, "other": null, "url": "https://www.zoomtravelinsurance.co.nz/"},
      {"id": "ins-1-cover", "provider": "1 Cover", "basic": 79.71, "comprehensive": 122.55, "multiTrip": 889.6, "other": null, "url": "https://www.1cover.co.nz/"},
      {"id": "ins-aa", "provider": "AA", "basic": 145.8, "comprehensive": 201.6, "multiTrip": 1274.4, "other": null, "url": "https://www.aa.co.nz/insurance/travel-insurance/"},
      {"id": "ins-covermore", "provider": "Covermore", "basic": 84.0, "comprehensive": 114.0, "multiTrip": 722.0, "other": null, "url": "https://www.covermore.co.nz/travel-insurance"},
      {"id": "ins-ami", "provider": "AMI", "basic": 94.0, "comprehensive": 111.0, "multiTrip": 527.0, "other": null, "url": "https://www.ami.co.nz/travel-insurance"},
      {"id": "ins-nib", "provider": "NIB", "basic": 153.0, "comprehensive": 304.0, "multiTrip": null, "other": null, "url": "https://www.nibtravel.co.nz/"},
      {"id": "ins-hot-mix-n-match-allianz", "provider": "HoT Mix n Match - Allianz", "basic": 185.15, "comprehensive": 192.26, "multiTrip": 1026.98, "other": null, "url": "https://www.mixandmatch.co.nz/insurance"},
      {"id": "ins-air-nz-insurance-covermore", "provider": "Air NZ Insurance - Covermore", "basic": null, "comprehensive": 218.0, "multiTrip": 1044.0, "other": null, "url": "https://insurance.airnewzealand.co.nz/"},
    ],
  },
  {
    title: "A couple in Europe for 10 days",
    basicLabel: "Basic",
    rows: [
      {"id": "ins-allianz", "provider": "Allianz", "basic": 155.91, "comprehensive": 253.2, "multiTrip": 941.29, "other": null, "url": "https://www.allianztravel.co.nz/"},
      {"id": "ins-tower", "provider": "Tower", "basic": 202.0, "comprehensive": 288.0, "multiTrip": 984.0, "other": null, "url": "https://www.tower.co.nz/travelinsurance/"},
      {"id": "ins-southern-cross", "provider": "Southern Cross", "basic": 124.41, "comprehensive": 234.31, "multiTrip": 705.1, "other": null, "url": "https://www.scti.co.nz/"},
      {"id": "ins-zoom-insurance", "provider": "Zoom Insurance", "basic": 171.03, "comprehensive": 171.03, "multiTrip": 593.81, "other": null, "url": "https://www.zoomtravelinsurance.co.nz/"},
      {"id": "ins-1-cover", "provider": "1 Cover", "basic": 169.43, "comprehensive": 242.36, "multiTrip": 889.6, "other": null, "url": "https://www.1cover.co.nz/"},
      {"id": "ins-aa", "provider": "AA", "basic": 262.8, "comprehensive": 372.6, "multiTrip": 1416.6, "other": null, "url": "https://www.aa.co.nz/insurance/travel-insurance/"},
      {"id": "ins-covermore", "provider": "Covermore", "basic": 144.0, "comprehensive": 196.0, "multiTrip": 708.0, "other": null, "url": "https://www.covermore.co.nz/travel-insurance"},
      {"id": "ins-ami", "provider": "AMI", "basic": 265.0, "comprehensive": 312.0, "multiTrip": 728.0, "other": null, "url": "https://www.ami.co.nz/travel-insurance"},
      {"id": "ins-nib", "provider": "NIB", "basic": 229.0, "comprehensive": 417.0, "multiTrip": null, "other": null, "url": "https://www.nibtravel.co.nz/"},
      {"id": "ins-hot-mix-n-match-allianz", "provider": "HoT Mix n Match - Allianz", "basic": 244.93, "comprehensive": 255.2, "multiTrip": 965.12, "other": null, "url": "https://www.mixandmatch.co.nz/insurance"},
      {"id": "ins-air-nz-insurance-covermore", "provider": "Air NZ Insurance - Covermore", "basic": null, "comprehensive": 320.0, "multiTrip": 1616.0, "other": null, "url": "https://insurance.airnewzealand.co.nz/"},
    ],
  },
  {
    title: "A family of 5 to the USA for 8 Days",
    basicLabel: "Basic",
    rows: [
      {"id": "ins-allianz", "provider": "Allianz", "basic": 253.47, "comprehensive": 411.7, "multiTrip": 1702.97, "other": null, "url": "https://www.allianztravel.co.nz/"},
      {"id": "ins-tower", "provider": "Tower", "basic": 250.0, "comprehensive": 356.0, "multiTrip": 1290.0, "other": null, "url": "https://www.tower.co.nz/travelinsurance/"},
      {"id": "ins-southern-cross", "provider": "Southern Cross", "basic": 196.54, "comprehensive": 332.42, "multiTrip": 1061.0, "other": null, "url": "https://www.scti.co.nz/"},
      {"id": "ins-zoom-insurance", "provider": "Zoom Insurance", "basic": 210.61, "comprehensive": 229.63, "multiTrip": 593.81, "other": null, "url": "https://www.zoomtravelinsurance.co.nz/"},
      {"id": "ins-1-cover", "provider": "1 Cover", "basic": 275.8, "comprehensive": 415.15, "multiTrip": 936.82, "other": null, "url": "https://www.1cover.co.nz/"},
      {"id": "ins-aa", "provider": "AA", "basic": 369.0, "comprehensive": 523.8, "multiTrip": 2043.0, "other": null, "url": "https://www.aa.co.nz/insurance/travel-insurance/"},
      {"id": "ins-covermore", "provider": "Covermore", "basic": 245.0, "comprehensive": 333.0, "multiTrip": 1235.0, "other": null, "url": "https://www.covermore.co.nz/travel-insurance"},
      {"id": "ins-ami", "provider": "AMI", "basic": 401.0, "comprehensive": 435.0, "multiTrip": 1421.0, "other": null, "url": "https://www.ami.co.nz/travel-insurance"},
      {"id": "ins-nib", "provider": "NIB", "basic": 278.0, "comprehensive": 514.0, "multiTrip": null, "other": null, "url": "https://www.nibtravel.co.nz/"},
      {"id": "ins-hot-mix-n-match-allianz", "provider": "HoT Mix n Match - Allianz", "basic": 398.76, "comprehensive": 415.44, "multiTrip": 1748.3, "other": null, "url": "https://www.mixandmatch.co.nz/insurance"},
      {"id": "ins-air-nz-insurance-covermore", "provider": "Air NZ Insurance - Covermore", "basic": null, "comprehensive": 414.0, "multiTrip": 1960.0, "other": null, "url": "https://insurance.airnewzealand.co.nz/"},
    ],
  },
  {
    title: "A trip for 2 to Southeast Asia for 14 Nights",
    basicLabel: "Basic",
    rows: [
      {"id": "ins-allianz", "provider": "Allianz", "basic": 181.7, "comprehensive": 295.08, "multiTrip": 925.67, "other": null, "url": "https://www.allianztravel.co.nz/"},
      {"id": "ins-tower", "provider": "Tower", "basic": 172.0, "comprehensive": 246.0, "multiTrip": 808.0, "other": null, "url": "https://www.tower.co.nz/travelinsurance/"},
      {"id": "ins-southern-cross", "provider": "Southern Cross", "basic": 166.76, "comprehensive": 286.23, "multiTrip": 679.39, "other": null, "url": "https://www.scti.co.nz/"},
      {"id": "ins-zoom-insurance", "provider": "Zoom Insurance", "basic": 185.41, "comprehensive": 201.07, "multiTrip": 593.81, "other": null, "url": "https://www.zoomtravelinsurance.co.nz/"},
      {"id": "ins-1-cover", "provider": "1 Cover", "basic": 200.11, "comprehensive": 278.88, "multiTrip": 889.6, "other": null, "url": "https://www.1cover.co.nz/"},
      {"id": "ins-aa", "provider": "AA", "basic": 214.2, "comprehensive": 302.4, "multiTrip": 1162.8, "other": null, "url": "https://www.aa.co.nz/insurance/travel-insurance/"},
      {"id": "ins-covermore", "provider": "Covermore", "basic": 180.0, "comprehensive": 244.0, "multiTrip": 740.0, "other": null, "url": "https://www.covermore.co.nz/travel-insurance"},
      {"id": "ins-ami", "provider": "AMI", "basic": 226.0, "comprehensive": 266.0, "multiTrip": 599.0, "other": null, "url": "https://www.ami.co.nz/travel-insurance"},
      {"id": "ins-nib", "provider": "NIB", "basic": 289.0, "comprehensive": 430.0, "multiTrip": null, "other": null, "url": "https://www.nibtravel.co.nz/"},
      {"id": "ins-hot-mix-n-match-allianz", "provider": "HoT Mix n Match - Allianz", "basic": 290.28, "comprehensive": 302.44, "multiTrip": 965.12, "other": null, "url": "https://www.mixandmatch.co.nz/insurance"},
      {"id": "ins-air-nz-insurance-covermore", "provider": "Air NZ Insurance - Covermore", "basic": null, "comprehensive": 338.0, "multiTrip": 1294.0, "other": null, "url": "https://insurance.airnewzealand.co.nz/"},
    ],
  },
  {
    title: "A couple of a Caribbean Cruise for 7 Nights",
    basicLabel: "Basic",
    rows: [
      {"id": "ins-allianz", "provider": "Allianz", "basic": null, "comprehensive": 347.0, "multiTrip": 1718.65, "other": null, "url": "https://www.allianztravel.co.nz/"},
      {"id": "ins-tower", "provider": "Tower", "basic": 220.0, "comprehensive": 316.0, "multiTrip": 1194.0, "other": "No Cruise Add ons", "url": "https://www.tower.co.nz/travelinsurance/"},
      {"id": "ins-southern-cross", "provider": "Southern Cross", "basic": null, "comprehensive": 326.72, "multiTrip": 941.4, "other": null, "url": "https://www.scti.co.nz/"},
      {"id": "ins-zoom-insurance", "provider": "Zoom Insurance", "basic": 216.31, "comprehensive": 235.95, "multiTrip": 646.27, "other": null, "url": "https://www.zoomtravelinsurance.co.nz/"},
      {"id": "ins-1-cover", "provider": "1 Cover", "basic": null, "comprehensive": 365.73, "multiTrip": 889.6, "other": null, "url": "https://www.1cover.co.nz/"},
      {"id": "ins-aa", "provider": "AA", "basic": 349.2, "comprehensive": 487.8, "multiTrip": 2043.0, "other": null, "url": "https://www.aa.co.nz/insurance/travel-insurance/"},
      {"id": "ins-covermore", "provider": "Covermore", "basic": 292.0, "comprehensive": 398.0, "multiTrip": 1642.0, "other": null, "url": "https://www.covermore.co.nz/travel-insurance"},
      {"id": "ins-ami", "provider": "AMI", "basic": 489.0, "comprehensive": 530.0, "multiTrip": 1734.0, "other": null, "url": "https://www.ami.co.nz/travel-insurance"},
      {"id": "ins-nib", "provider": "NIB", "basic": 313.0, "comprehensive": 614.0, "multiTrip": null, "other": null, "url": "https://www.nibtravel.co.nz/"},
      {"id": "ins-hot-mix-n-match-allianz", "provider": "HoT Mix n Match - Allianz", "basic": null, "comprehensive": 355.57, "multiTrip": 1791.93, "other": null, "url": "https://www.mixandmatch.co.nz/insurance"},
      {"id": "ins-air-nz-insurance-covermore", "provider": "Air NZ Insurance - Covermore", "basic": null, "comprehensive": null, "multiTrip": 1960.0, "other": null, "url": "https://insurance.airnewzealand.co.nz/"},
    ],
  },
];
