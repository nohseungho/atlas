// ATLAS 단일 운영 화면의 "주제 선택" 단계가 읽는 유일한 주제 원천.
//
// 유료 API를 쓰지 않는다. 주제·근거·출처는 이 파일에 고정된 검증 자료이며,
// 실제 글은 lib/atlas/operate/korea-info-writer.js / global-dialogue-writer.js가
// 이 자료만으로 조립한다. 여기서 문장을 지어내지 않는다.
//
// 채널 규칙은 lib/atlas/character-channel-policy.js가 단일 기준이다.
// 국내(수호)는 생활편의·시즌별 검색형 정보글, 해외(미지)는 여행 정보형 문답 글.

import { ATLAS_CHANNEL_ID } from "../character-channel-policy.js";

// 국내 생활편의·시즌 정보글. season 은 해당 주제가 우선 노출되는 월(1~12).
// 제휴 링크 없이 발행 가능한 정보글이므로 affiliate 관련 필드를 두지 않는다.
export const KOREA_TOPICS = Object.freeze([
  {
    id: "kr_info_autumn_humidity",
    season: [9, 10, 11],
    title: "환절기 집안 습도 관리, 가을에 유독 어려운 이유와 방마다 다른 해결법",
    keyword: "환절기 습도 관리",
    lead: "가을이 되면 낮에는 건조한데 아침저녁으로는 창가에 물이 맺힙니다. 같은 집 안에서도 방마다 습도가 다르기 때문입니다.",
    sections: [
      {
        heading: "가을 습도가 방마다 다른 이유",
        paragraphs: [
          "가을은 바깥 공기가 차가워지는 속도가 실내보다 빠릅니다. 그래서 바깥과 맞닿은 벽이나 창가는 실내 평균보다 온도가 낮고, 같은 양의 수증기라도 그 자리에서 먼저 물방울로 바뀝니다.",
          "거실은 사람이 많이 움직이고 환기도 자주 되지만, 북향 방이나 붙박이장 안쪽은 공기가 거의 움직이지 않습니다. 결로와 곰팡이가 늘 같은 자리에서 반복되는 이유입니다.",
        ],
      },
      {
        heading: "방마다 다르게 잡는 실내 습도 기준",
        paragraphs: [
          "환절기 실내 습도는 40~60%를 기준으로 봅니다. 40% 아래로 내려가면 목과 피부가 먼저 반응하고, 60%를 넘기면 결로와 곰팡이 위험이 올라갑니다.",
          "침실은 자는 동안 호흡으로 습도가 올라가므로 잠들기 전 기준을 조금 낮게, 거실은 활동 시간대에 맞춰 조금 높게 두면 하루 전체 편차가 줄어듭니다.",
        ],
      },
      {
        heading: "돈 안 드는 순서부터 해결하기",
        paragraphs: [
          "가장 먼저 할 일은 환기입니다. 아침에 5~10분, 맞바람이 통하도록 마주 보는 창을 함께 여는 방식이 가장 효율이 좋습니다.",
          "그 다음은 가구 배치입니다. 외벽에 딱 붙은 장롱과 침대를 5cm 이상 띄우면 그 자리에 공기가 지나갈 길이 생깁니다.",
          "여기까지 해도 특정 방만 계속 축축하다면 그때 제습기나 가습기 같은 장비를 고려합니다. 순서를 바꾸면 장비를 사고도 같은 자리에 곰팡이가 다시 생깁니다.",
        ],
      },
      {
        heading: "자주 틀리는 세 가지",
        paragraphs: [
          "첫째, 창문을 계속 닫아두는 것입니다. 습기는 빠져나갈 곳이 있어야 줄어듭니다.",
          "둘째, 빨래를 방 안에서 말리면서 문까지 닫는 것입니다. 습도가 올라간 공기가 갇힙니다.",
          "셋째, 곰팡이를 마른 천으로 닦아내는 것입니다. 포자가 공기 중으로 흩어져 다른 자리로 옮겨 갑니다.",
        ],
      },
    ],
    checklist: [
      "아침 환기 5~10분, 마주 보는 창을 함께 열기",
      "외벽에 붙은 가구는 5cm 이상 띄우기",
      "실내 습도 40~60% 유지",
      "실내 건조 시에는 문을 열어두고 공기 순환시키기",
    ],
    faq: [
      { q: "제습기와 가습기를 같이 써도 되나요?", a: "같은 방에서 동시에 쓰면 서로 상쇄되어 전기만 씁니다. 방마다 습도가 다르다면 방별로 하나씩 나눠 쓰는 편이 맞습니다." },
      { q: "결로가 생긴 창틀은 어떻게 닦나요?", a: "마른 천보다 젖은 천으로 닦아낸 뒤 환기로 말립니다. 마른 상태에서 문지르면 곰팡이 포자가 날립니다." },
      { q: "습도계는 어디에 두는 것이 좋나요?", a: "사람이 오래 머무는 자리의 가슴 높이에 둡니다. 창가나 바닥은 실제 생활 습도와 차이가 큽니다." },
    ],
  },
  {
    id: "kr_info_heating_prep",
    season: [10, 11, 12],
    title: "보일러 첫 가동 전 점검, 난방비를 결정하는 것은 온도가 아니라 순서입니다",
    keyword: "보일러 첫 가동 점검",
    lead: "날이 쌀쌀해지면 보일러를 켜게 되는데, 첫 가동 전에 확인하지 않으면 같은 온도로 틀어도 난방비가 크게 달라집니다.",
    sections: [
      {
        heading: "첫 가동 전에 꼭 보는 세 가지",
        paragraphs: [
          "첫째는 보일러 압력입니다. 보일러 앞면 압력계가 권장 범위 아래로 내려가 있으면 물을 보충해야 정상적으로 데워집니다.",
          "둘째는 분배기 밸브입니다. 여름 동안 잠가둔 방이 있으면 그 방만 찬물이 돌아 전체 순환 효율이 떨어집니다.",
          "셋째는 온수 상태입니다. 온수가 미지근하거나 온도가 널뛰면 배관이나 열교환기 점검이 필요한 신호입니다.",
        ],
      },
      {
        heading: "실내온도와 온수온도는 다른 설정입니다",
        paragraphs: [
          "실내온도 모드는 방 안의 온도센서를 기준으로 보일러를 켜고 끕니다. 온돌(온수)온도 모드는 바닥으로 나가는 물의 온도를 기준으로 합니다.",
          "집이 잘 데워지지 않을 때 실내온도만 계속 올리면 보일러가 쉬지 않고 돌아갑니다. 바닥이 차다면 온돌온도를 손보는 쪽이 맞습니다.",
        ],
      },
      {
        heading: "외출 모드를 쓰는 기준",
        paragraphs: [
          "몇 시간 정도 비운다면 외출 모드보다 평소보다 2~3도 낮춘 실내온도 유지가 낫습니다. 완전히 식은 집을 다시 데우는 데 드는 에너지가 더 크기 때문입니다.",
          "하루 이상 집을 비울 때는 외출 모드가 맞습니다. 동파 방지 기능이 함께 동작합니다.",
        ],
      },
      {
        heading: "난방비가 새는 자리",
        paragraphs: [
          "창문 틈과 현관문 아래는 난방한 공기가 가장 빨리 빠져나가는 자리입니다. 문풍지와 문 아래 막이는 비용 대비 효과가 확실합니다.",
          "커튼은 두꺼울수록 좋지만 바닥에 닿아 라디에이터나 바닥 난방을 덮지 않도록 길이를 확인합니다.",
        ],
      },
    ],
    checklist: [
      "보일러 압력계가 권장 범위 안에 있는지 확인",
      "분배기 밸브를 모두 열어 순환 점검",
      "온수 온도가 일정한지 확인",
      "짧은 외출은 실내온도 2~3도 낮추기, 장기 외출만 외출 모드",
      "창문 틈·현관문 아래 마감 상태 확인",
    ],
    faq: [
      { q: "보일러를 껐다 켰다 하는 게 더 아끼는 방법인가요?", a: "짧은 간격으로 껐다 켜면 다시 데우는 데 드는 에너지가 더 큽니다. 낮은 온도로 유지하는 쪽이 대체로 유리합니다." },
      { q: "분배기 밸브를 다 열면 난방비가 더 나오지 않나요?", a: "쓰지 않는 방을 잠그면 그 방이 차가워져 옆방 열을 계속 빼앗습니다. 전체를 열어 고르게 순환시키는 편이 효율적인 경우가 많습니다." },
      { q: "압력이 자꾸 떨어지면 어떻게 하나요?", a: "보충해도 반복해서 떨어진다면 배관 어딘가에서 물이 새고 있을 수 있습니다. 직접 만지지 말고 점검을 받는 쪽이 안전합니다." },
    ],
  },
  {
    id: "kr_info_fridge_reset",
    season: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    title: "냉장고 정리, 칸마다 온도가 다르다는 것만 알아도 버리는 음식이 줄어듭니다",
    keyword: "냉장고 정리 방법",
    lead: "냉장고를 아무리 정리해도 결국 안쪽에서 상한 음식이 나옵니다. 정리 순서보다 칸마다 온도가 다르다는 점을 먼저 보면 달라집니다.",
    sections: [
      {
        heading: "칸마다 온도가 다릅니다",
        paragraphs: [
          "냉장실에서 가장 차가운 곳은 안쪽 아래칸이고, 가장 온도가 높은 곳은 문쪽 선반입니다. 문은 열 때마다 바깥 공기와 만나기 때문입니다.",
          "그래서 우유와 달걀을 문쪽에 두는 익숙한 배치가 실제로는 가장 불리합니다. 상하기 쉬운 것일수록 안쪽 아래로 보내야 합니다.",
        ],
      },
      {
        heading: "자리를 정하는 기준",
        paragraphs: [
          "안쪽 아래칸에는 육류·어류처럼 온도에 민감한 재료를 둡니다. 중간칸에는 조리한 음식과 유제품, 위칸에는 바로 먹는 반찬과 음료를 둡니다.",
          "채소칸은 습도가 높게 유지되므로 잎채소와 뿌리채소에 맞습니다. 다만 사과와 바나나처럼 숙성 가스를 내는 과일은 따로 둬야 옆의 채소가 빨리 무르지 않습니다.",
          "문쪽 선반에는 장류·드레싱처럼 온도 변화에 강한 것을 둡니다.",
        ],
      },
      {
        heading: "70% 규칙",
        paragraphs: [
          "냉장실은 70% 정도만 채우는 편이 좋습니다. 빈 공간이 있어야 찬 공기가 돌고 온도가 고르게 유지됩니다.",
          "반대로 냉동실은 꽉 채울수록 효율이 좋습니다. 얼어 있는 것들이 서로의 냉기를 붙잡아 주기 때문입니다.",
        ],
      },
      {
        heading: "버리는 음식을 줄이는 배치",
        paragraphs: [
          "가장 앞줄은 이번 주에 먹을 것만 두는 자리로 비워둡니다. 새로 산 것은 뒤로 넣고 먼저 산 것을 앞으로 당기는 순서만 지켜도 잊고 상하는 일이 크게 줄어듭니다.",
          "개봉한 날짜를 용기에 적어두면 냄새로 판단하지 않아도 됩니다.",
        ],
      },
    ],
    checklist: [
      "육류·어류는 냉장실 안쪽 아래칸",
      "우유·달걀은 문쪽이 아니라 중간 안쪽",
      "숙성 가스를 내는 과일은 채소칸과 분리",
      "냉장실 70%, 냉동실은 빈틈 없이",
      "새로 산 것은 뒤로, 먼저 산 것은 앞으로",
    ],
    faq: [
      { q: "냉장고 온도는 몇 도가 적당한가요?", a: "냉장실은 0~5도, 냉동실은 영하 18도 이하를 기준으로 봅니다. 설정값과 실제 온도가 다를 수 있으니 온도계로 한 번 확인해 보는 편이 좋습니다." },
      { q: "뜨거운 음식을 바로 넣어도 되나요?", a: "냉장고 내부 온도를 끌어올려 옆에 있는 음식까지 위험해집니다. 어느 정도 식힌 뒤 넣습니다." },
      { q: "냄새가 계속 날 때는 어떻게 하나요?", a: "원인을 먼저 찾아 버리는 것이 먼저입니다. 탈취제는 원인을 없앤 다음에 의미가 있습니다." },
    ],
  },
]);

// 해외 Blogger(미지) 여행 정보형 문답 글.
// sources 는 실제 공개 기관 페이지만 둔다(https 필수, 검증 대상).
export const GLOBAL_TOPICS = Object.freeze([
  {
    id: "gl_info_passport_validity",
    slug: "passport-validity-rules-before-you-book",
    keyword: "passport validity rules",
    title: "Passport Validity Rules: Why Your Trip Can Be Denied With a Valid Passport",
    metaDescription:
      "Many countries require your passport to stay valid for six months beyond your arrival date, and airlines check this at the gate. Here is how the six-month rule, blank-page requirements and renewal timing actually work before you book.",
    category: "Travel Safety",
    searchIntent: "informational",
    quickAnswer:
      "A passport that has not expired is not always accepted. Many destinations require at least six months of remaining validity from your date of entry, plus one or two blank pages, and the airline enforces this at check-in — not the destination.",
    comparisonCriteria: [
      "Remaining validity required on the date you arrive",
      "Blank visa pages the destination asks for",
      "Who checks the rule first: the airline or the border",
    ],
    comparisonHeaders: ["Situation", "What is usually required", "Where it is checked"],
    comparisonTable: [
      ["Six-month validity destinations", "6 months beyond arrival date", "Airline check-in desk"],
      ["Three-month validity destinations", "3 months beyond departure from the area", "Airline and border control"],
      ["Blank page requirement", "1–2 blank visa pages", "Border control on arrival"],
    ],
    keyTakeaways: [
      "Count validity from your arrival date, not from the day you book.",
      "The airline can refuse boarding before you ever reach the border.",
      "Renewal processing times move with demand, so check them before you buy a ticket.",
    ],
    dialogue: [
      {
        heading: "Why a Valid Passport Is Not Always Enough",
        turns: [
          ["Suho", "My passport does not expire until next spring. Why would anyone turn me away?"],
          ["Miji", "Because a lot of countries do not ask whether the passport is valid today. They ask how much validity is left on the day you arrive. Six months is the most common threshold, and your spring expiry may be under that."],
          ["Suho", "So the country decides, but who actually stops me?"],
          ["Miji", "The airline, usually. Carriers are responsible for passengers they bring to a border that refuses entry, so they check the rule at the desk. That is why people find out at check-in rather than on arrival."],
        ],
      },
      {
        heading: "How to Count the Six Months Correctly",
        turns: [
          ["Suho", "Do I count six months from when I leave home?"],
          ["Miji", "From the date you enter the destination. If you arrive on 10 March, your passport should generally be valid through 10 September. For a multi-country trip, use the latest arrival date on the itinerary, not the first."],
          ["Suho", "And if I am only connecting through an airport?"],
          ["Miji", "Transit rules differ by country, and some apply their own validity and visa requirements even airside. Check the transit country separately instead of assuming a layover is exempt."],
        ],
      },
      {
        heading: "Blank Pages and the Stamps You Cannot Control",
        turns: [
          ["Suho", "I have pages left, but they all have stamps on them."],
          ["Miji", "Several destinations require genuinely blank visa pages — often one or two — and pages marked \"amendments and endorsements\" do not always count. Border officers need somewhere to place a visa or an entry stamp."],
          ["Suho", "Can I add pages instead of renewing?"],
          ["Miji", "Many passport authorities stopped adding pages years ago, so the answer is usually a full renewal. That is a timing problem, not a paperwork problem."],
        ],
      },
      {
        heading: "Renewal Timing Before You Book",
        turns: [
          ["Suho", "How early should I renew?"],
          ["Miji", "Check the published processing time for your passport authority, then add your own buffer. Processing estimates are averages, and they lengthen during peak travel seasons."],
          ["Suho", "What if I have already booked and the timing is tight?"],
          ["Miji", "Look for an expedited or urgent service before you change the trip. And keep in mind that while your application is being processed, your old passport is usually not available to you."],
        ],
      },
      {
        heading: "A Check You Can Do in Five Minutes",
        turns: [
          ["Suho", "Give me the short version I can actually run through tonight."],
          ["Miji", "Open your passport, write down the expiry date, then write down your arrival date at each country on the trip. If any arrival date is within six months of the expiry, treat the trip as blocked until you renew. Then count your blank pages, and check the official entry requirements for every country on the route, including transits."],
          ["Suho", "And I should do that before paying for anything."],
          ["Miji", "Before paying, yes. A renewal is inconvenient. A non-refundable ticket you cannot use is worse."],
        ],
      },
    ],
    faq: [
      {
        question: "Does the six-month rule apply to every country?",
        answer: "No. Some destinations require six months of validity beyond arrival, some require three months beyond your departure from the area, and some only require the passport to be valid for the stay. Check the official entry requirements for each country on your route.",
      },
      {
        question: "Does a layover count as entering a country?",
        answer: "It can. Some countries apply passport validity and transit visa rules even when you do not leave the airport. Treat every transit point as its own set of requirements.",
      },
      {
        question: "Can the airline really refuse to board me?",
        answer: "Yes. Airlines can be penalised for carrying a passenger who is refused entry, so they check documents at check-in and can deny boarding.",
      },
      {
        question: "Can I still travel while my renewal is being processed?",
        answer: "Usually not, because the passport is normally held during processing. If you have imminent travel, look into the urgent or expedited service your passport authority offers before booking anything else.",
      },
    ],
    trust: {
      methodology:
        "Written from the published entry-requirement guidance of national travel authorities. It explains how the rules are structured and where they are enforced; it does not state the requirement for any specific country, because those change and are published per destination.",
      independenceNote: "This guide contains no affiliate links and recommends no product.",
    },
    sources: [
      { title: "U.S. Department of State — Your Passport and Travel Documents", url: "https://travel.state.gov/content/travel/en/passports.html" },
      { title: "U.S. Department of State — Country Information", url: "https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages.html" },
      { title: "UK Government — Passport Rules for Travel to Europe", url: "https://www.gov.uk/guidance/passport-rules-for-travel-to-europe" },
    ],
    koreanReview:
      "여권이 만료되지 않았더라도 입국일 기준 잔여 유효기간(흔히 6개월)과 빈 사증란 요건 때문에 탑승이 거부될 수 있다는 점을 미지와 수호의 문답으로 설명한 정보글입니다. 특정 국가의 요건을 단정하지 않고 확인 방법과 갱신 시점 판단 기준만 제시했습니다. 제휴 링크는 없습니다.",
  },
  {
    id: "gl_info_travel_power",
    slug: "travel-plug-adapters-and-voltage-what-actually-breaks",
    keyword: "travel plug adapter voltage",
    title: "Plug Adapters vs Voltage Converters: What Actually Breaks Your Devices Abroad",
    metaDescription:
      "An adapter changes the shape of the plug and a converter changes the voltage, and confusing the two is what destroys hair dryers and chargers abroad. Here is how to read the label on your own device before you pack anything.",
    category: "Travel Safety",
    searchIntent: "informational",
    quickAnswer:
      "An adapter only changes the plug shape; it does not change voltage. Most phone and laptop chargers are already dual voltage and need nothing but an adapter, while single-voltage heating devices such as hair dryers and travel kettles are what actually burn out.",
    comparisonCriteria: [
      "What the device's own input label says",
      "Whether the device generates heat or charges a battery",
      "Whether the destination's outlet shape or its voltage is the real difference",
    ],
    comparisonHeaders: ["Device type", "What it usually needs", "Why"],
    comparisonTable: [
      ["Phone / laptop charger", "Plug adapter only", "Input label typically reads 100–240V"],
      ["Hair dryer, travel iron, kettle", "Check for dual voltage; otherwise buy locally", "Heating elements are usually single voltage"],
      ["Camera or rechargeable battery charger", "Plug adapter only, in most cases", "Also usually dual voltage — but read the label"],
    ],
    keyTakeaways: [
      "The answer is printed on your own device, in the small text near the plug.",
      "100–240V means an adapter is enough; a single number such as 120V does not.",
      "Heat-producing devices are the ones that fail, and a converter is often heavier than buying one at the destination.",
    ],
    dialogue: [
      {
        heading: "The One Label That Answers Everything",
        turns: [
          ["Suho", "I keep seeing adapters and converters sold side by side. Which one do I need?"],
          ["Miji", "Look at your device first. On the power brick or near the plug there is a line that starts with INPUT. If it says 100–240V, the device already handles both standards and you only need a plug adapter."],
          ["Suho", "And if it shows only one number?"],
          ["Miji", "Then the device is single voltage. Plugging it into a higher-voltage outlet through a plain adapter is exactly how people destroy things on the first morning of a trip."],
        ],
      },
      {
        heading: "Why Chargers Survive and Hair Dryers Do Not",
        turns: [
          ["Suho", "Why is my laptop fine but my hair dryer is not?"],
          ["Miji", "A charger converts power electronically, and manufacturers build one model for the whole world, so dual voltage is cheap for them. A hair dryer turns power directly into heat. Double the voltage into a heating element and you get roughly four times the power for as long as it survives, which is not long."],
          ["Suho", "So a converter fixes that?"],
          ["Miji", "It can, but travel converters are often rated well below what a hair dryer draws. Check the wattage rating on the converter against the wattage on the dryer before you trust it."],
        ],
      },
      {
        heading: "Plug Shape Is a Separate Problem",
        turns: [
          ["Suho", "Does a dual-voltage device still need an adapter?"],
          ["Miji", "Yes, if the outlet shape is different. Voltage and plug shape are two independent things — a device can be perfectly happy with the electricity and still not physically fit the socket."],
          ["Suho", "What about the earth pin?"],
          ["Miji", "Cheap two-pin adapters quietly drop the earth connection. For anything with a metal body or a three-pin plug at home, use an adapter that keeps the earth pin."],
        ],
      },
      {
        heading: "What to Actually Pack",
        turns: [
          ["Suho", "Give me a packing rule I can follow without thinking."],
          ["Miji", "One adapter that fits the destination and keeps the earth pin. A multi-port USB charger so several devices share one socket. And leave every single-voltage heating device at home."],
          ["Suho", "Even if the hotel has no dryer?"],
          ["Miji", "Buying an inexpensive one at the destination is usually lighter, cheaper and safer than carrying a converter that may not be rated for it."],
        ],
      },
      {
        heading: "Before You Close the Suitcase",
        turns: [
          ["Suho", "Last check?"],
          ["Miji", "Read the INPUT line on every power brick you packed. Anything that is not 100–240V comes out of the bag or gets a converter you have actually checked the rating on. Then confirm the plug type your destination uses, and count your sockets — hotel rooms have fewer than you expect."],
          ["Suho", "That is a five-minute job."],
          ["Miji", "It is. It just has to happen before the trip rather than after."],
        ],
      },
    ],
    faq: [
      {
        question: "How do I know if my device is dual voltage?",
        answer: "Read the small text on the power brick or near the plug. A range such as 100–240V means dual voltage. A single figure means the device is built for one standard only.",
      },
      {
        question: "Is a universal adapter the same as a converter?",
        answer: "No. A universal adapter changes the plug shape for many countries but leaves the voltage untouched. A converter changes the voltage, and it is a different, heavier product.",
      },
      {
        question: "Can I use a USB charger from another country?",
        answer: "In most cases yes, because USB chargers are usually dual voltage — but confirm it on the label rather than assuming.",
      },
      {
        question: "Do I need a converter for a phone or a laptop?",
        answer: "Almost never. These chargers are typically dual voltage, so a plug adapter is enough.",
      },
    ],
    trust: {
      methodology:
        "Built from the electrical-safety guidance published by consumer-safety and standards bodies, applied to the labels printed on ordinary consumer devices. It explains how to read your own equipment rather than listing voltages by country, because those are published per destination and change.",
      independenceNote: "This guide contains no affiliate links and recommends no product.",
    },
    sources: [
      { title: "U.S. Consumer Product Safety Commission — Electrical Safety", url: "https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Electrical-Safety" },
      { title: "International Electrotechnical Commission — World Plugs", url: "https://www.iec.ch/world-plugs" },
      { title: "Electrical Safety First — Product Safety Advice", url: "https://www.electricalsafetyfirst.org.uk/guidance/safety-around-the-home/" },
    ],
    koreanReview:
      "플러그 어댑터와 전압 변환기의 차이, 그리고 기기 라벨의 INPUT 표기를 읽는 법을 미지와 수호의 문답으로 설명한 정보글입니다. 국가별 전압을 단정하지 않고 확인 방법만 제시했으며 제휴 링크는 없습니다.",
  },
]);

export function koreaTopics({ month = new Date().getMonth() + 1 } = {}) {
  return KOREA_TOPICS.map((topic) => ({
    ...topic,
    channelId: ATLAS_CHANNEL_ID.KOREA_NAVER,
    inSeason: topic.season.includes(month),
  })).sort((a, b) => Number(b.inSeason) - Number(a.inSeason));
}

export function globalTopics() {
  return GLOBAL_TOPICS.map((topic) => ({ ...topic, channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER }));
}

export function findTopic(topicId) {
  return (
    KOREA_TOPICS.find((t) => t.id === topicId) ||
    GLOBAL_TOPICS.find((t) => t.id === topicId) ||
    null
  );
}
