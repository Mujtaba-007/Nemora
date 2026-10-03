-- Seed daily challenges for Nemora
-- Insert at least 5 sample challenges with distinct dates
INSERT INTO public.daily_challenges (challenge_date, title, description, starter_code, max_score)
VALUES
  ('2024-01-01', 'Hello World Challenge', 'Write a function that returns "Hello, World!"', 'function hello() { return "Hello, World!"; }', 100),
  ('2024-01-08', 'Array Sum', 'Calculate the sum of numbers in an array.', 'function sum(arr) { return arr.reduce((a,b) => a+b, 0); }', 100),
  ('2024-01-15', 'Palindrome Check', 'Check if a string is a palindrome.', 'function isPalindrome(str) { const s = str.replace(/[^a-z0-9]/gi, "").toLowerCase(); return s === s.split("").reverse().join(""); }', 100),
  ('2024-01-22', 'FizzBuzz', 'Print numbers 1-100 with FizzBuzz rules.', 'function fizzBuzz() { for(let i=1;i<=100;i++){ let out=""; if(i%3===0) out+="Fizz"; if(i%5===0) out+="Buzz"; console.log(out||i); } }', 100),
  ('2024-01-29', 'Factorial', 'Compute factorial of a number.', 'function factorial(n){ return n<=1?1:n*factorial(n-1); }', 100)
ON CONFLICT (challenge_date) DO NOTHING;
