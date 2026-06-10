// 自動轉換自 chem_question.xlsx (支援 subunit)
const ALL_UNITS = {
  "C_0": {
    "name": "Chemistry - Terminology (術語考核)",
    "subunits": {
      "C_0_5": {
        "name": "Basic Terms",
        "questions": [
          {
            "id": "C05G001",
            "text": "Proton",
            "options": [
              "A. 質子",
              "B. 中子",
              "C. 電子",
              "D. 原子核"
            ],
            "correct": "A",
            "explanation": "Proton = 質子",
            "imageUrl": null,
            "difficulty": "Basic"
          },
          {
            "id": "C05G002",
            "text": "Electron",
            "options": [
              "A. 質子",
              "B. 中子",
              "C. 電子",
              "D. 離子"
            ],
            "correct": "C",
            "explanation": "Electron = 電子",
            "imageUrl": null,
            "difficulty": "Basic"
          },
          {
            "id": "C05G004",
            "text": "Nucleus",
            "options": [
              "A. 質子",
              "B. 中子",
              "C. 電子",
              "D. 原子核"
            ],
            "correct": "D",
            "explanation": "Nucleus = 原子核",
            "imageUrl": null,
            "difficulty": "Basic"
          }
        ]
      },
      "C_0_7": {
        "name": "Bonding Terms",
        "questions": [
          {
            "id": "C07G003",
            "text": "Ionic bond",
            "options": [
              "A. 共價鍵",
              "B. 離子鍵",
              "C. 金屬鍵",
              "D. 氫鍵"
            ],
            "correct": "B",
            "explanation": "Ionic bond = 離子鍵",
            "imageUrl": null,
            "difficulty": "Basic"
          }
        ]
      }
    }
  }
};
