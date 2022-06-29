//三項演算子
// ? true : false
// const val1 = 1 < 0 ? 'true' : 'false';
// console.log(val1);

// const num = "1300";
// console.log(num.toLocaleString());

// const formattedNum = typeof num === 'number' ? num.toLocaleString() : '数値を入力してください';
// console.log(formattedNum);

const checkSum = (num1, num2) => {
  return num1 + num2 > 100 ? "over 100" : "under 100";
};
console.log(checkSum(50, 49));
