"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";

interface Post {
  id: string;
  title: string;
  body: string;
  post_type: "educational" | "promotional";
  display_position: string;
  media_url: string | null;
  media_type: "image" | "video";
  views_count: number;
  created_at: string;
}

interface Comment {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface Reaction {
  reaction_type: "like" | "dislike";
}

function getFingerprint(): string {
  const key = "visitor_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `fp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

function PostCard({ post }: { post: Post }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<{ likes: number; dislikes: number; userReaction: "like" | "dislike" | null }>({ likes: 0, dislikes: 0, userReaction: null });
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fp = typeof window !== "undefined" ? getFingerprint() : "";

  useEffect(() => {
    fetchReactions();
    // Increment views silently
    (async () => {
      try { await supabase.rpc("increment_post_views", { post_id: post.id }); } catch { /* silent */ }
    })();
  }, [post.id]);

  async function fetchReactions() {
    const { data } = await supabase
      .from("post_reactions")
      .select("reaction_type")
      .eq("post_id", post.id);

    const all = (data || []) as Reaction[];
    const likes = all.filter((r) => r.reaction_type === "like").length;
    const dislikes = all.filter((r) => r.reaction_type === "dislike").length;
    const { data: myReaction } = await supabase
      .from("post_reactions")
      .select("reaction_type")
      .eq("post_id", post.id)
      .eq("visitor_fingerprint", fp)
      .single();
    setReactions({ likes, dislikes, userReaction: myReaction?.reaction_type || null });
  }

  async function fetchComments() {
    const { data } = await supabase
      .from("post_comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(data || []);
  }

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments((v) => !v);
  };

  const handleReaction = async (type: "like" | "dislike") => {
    if (reactions.userReaction === type) {
      // Remove reaction
      await supabase.from("post_reactions").delete().eq("post_id", post.id).eq("visitor_fingerprint", fp);
    } else {
      // Upsert reaction
      await supabase.from("post_reactions").upsert(
        { post_id: post.id, visitor_fingerprint: fp, reaction_type: type },
        { onConflict: "post_id,visitor_fingerprint" }
      );
    }
    fetchReactions();
  };

  const handleCommentSubmit = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("post_comments").insert({
        post_id: post.id,
        author_name: commentName.trim() || "زائر",
        content: commentText.trim(),
      });
      setCommentText("");
      fetchComments();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
      {/* Media */}
      {post.media_url && (
        <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {post.media_type === "video" ? (
            <video src={post.media_url} controls className="w-full h-full object-cover" />
          ) : (
            <img src={post.media_url} alt={post.title} className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500" />
          )}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Type badge + date */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${post.post_type === "promotional" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
            {post.post_type === "promotional" ? "📣 ترويجي" : "📚 تعليمي"}
          </span>
          <span className="text-xs text-gray-400">{new Date(post.created_at).toLocaleDateString("ar-IQ")}</span>
        </div>

        <div>
          <h2 className="font-extrabold text-gray-900 dark:text-white text-lg leading-snug">{post.title}</h2>
          {post.body && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">{post.body}</p>}
        </div>

        {/* Stats + Reactions */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex-wrap">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span>👁️</span> {post.views_count} مشاهدة
          </span>
          <div className="flex items-center gap-2 mr-auto">
            <button
              onClick={() => handleReaction("like")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${reactions.userReaction === "like" ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"}`}
            >
              👍 {reactions.likes}
            </button>
            <button
              onClick={() => handleReaction("dislike")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${reactions.userReaction === "dislike" ? "bg-red-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/40"}`}
            >
              👎 {reactions.dislikes}
            </button>
            <button
              onClick={toggleComments}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all"
            >
              💬 {showComments ? "إغلاق" : "التعليقات"}
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {/* Comment Form */}
            <div className="space-y-2">
              <input
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                placeholder="اسمك (اختياري)"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="اكتب تعليقك..."
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  onKeyDown={(e) => e.key === "Enter" && handleCommentSubmit()}
                />
                <button
                  onClick={handleCommentSubmit}
                  disabled={submitting || !commentText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                >
                  إرسال
                </button>
              </div>
            </div>

            {/* Comments List */}
            {comments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">لا توجد تعليقات بعد. كن أول من يعلّق!</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-extrabold text-gray-800 dark:text-gray-200">{c.author_name}</span>
                      <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleDateString("ar-IQ")}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function PostsPublicPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "educational" | "promotional">("all");

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    setLoading(true);
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("is_published", true)
      .order("views_count", { ascending: false });
    setPosts(data || []);
    setLoading(false);
  }

  const filtered = filter === "all" ? posts : posts.filter((p) => p.post_type === filter);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 overflow-x-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline">
            ← العودة للمتجر
          </Link>
          <h1 className="font-extrabold text-gray-900 dark:text-white text-lg">📢 المنشورات</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {([["all", "الكل"], ["educational", "📚 تعليمي"], ["promotional", "📣 ترويجي"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${filter === v ? "bg-blue-600 text-white shadow-md" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Posts Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-5xl block mb-3">📭</span>
            <p className="text-gray-500 dark:text-gray-400 font-bold">لا توجد منشورات في هذه الفئة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filtered.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
